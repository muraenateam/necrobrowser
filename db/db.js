const redis = require("redis");
const shortid = require("shortid");
const c = require('chalk');
const log = require('./../lib/logger');

// Create a singleton Redis client
let client = null;
let isConnecting = false;

async function getClient() {
    if (!client || !client.isOpen) {
        // Prevent multiple simultaneous connection attempts
        if (isConnecting) {
            // Wait for the connection to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            return getClient();
        }

        isConnecting = true;

        try {
            client = redis.createClient({
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            console.error(c.red('[Redis] Max reconnection attempts reached'));
                            return new Error('Redis max reconnection attempts reached');
                        }
                        const delay = Math.min(retries * 100, 3000);
                        console.log(c.yellow(`[Redis] Reconnecting in ${delay}ms... (attempt ${retries})`));
                        return delay;
                    }
                }
            });

            // Error handler - prevents crashes on Redis errors
            client.on("error", function (error) {
                log.LogError('REDIS ERROR DETECTED', {
                    'Error': error.message,
                    'Time': new Date().toISOString()
                });
            });

            // Connection events for better visibility
            client.on("ready", function () {
                log.LogSuccess('[Redis] Client ready and connected');
            });

            client.on("reconnecting", function () {
                log.LogWarning('[Redis] Client reconnecting...');
            });

            client.on("end", function () {
                log.LogWarning('[Redis] Connection closed');
            });

            await client.connect();
            isConnecting = false;
        } catch (error) {
            isConnecting = false;
            console.error(c.red('[Redis] Failed to connect:'), error.message);
            throw error;
        }
    }
    return client;
}

exports.CheckRedis = async function () {
    try {
        const checkRedis = await getClient();
        await checkRedis.ping();
        console.log("Redis connection successful");
    } catch (error) {
        console.error("error: cannot connect to Redis at tcp://127.0.0.1:6379\nexiting now...");
        process.exit(1);
    }
}
// redis keyspace:
// task:<type>:<short-id> ...
// task:github:PPBqWA9
// related cookies are another HMSET like:
// task:<type>:<short-id>
exports.AddTask = async function (name, task, cookies) {
    const redisClient = await getClient();
    const id = shortid.generate();

    const key = `task:${task}:${id}`;
    console.log(`[DB] AddTask: Creating task ${key} with name="${name}", status="queued", cookies_length=${cookies.length}`);

    await redisClient.hSet(key, {
        "name": name,
        "cookies": cookies,
        "status": "queued"
    });

    console.log(`[DB] AddTask: Task ${key} successfully created in Redis`);
    return key;
}

exports.AddExtrudedData = async function (key, entryKey, entryValue) {
    const redisClient = await getClient();
    const id = shortid.generate();
    let dataKey = `${key}:extruded`
    let dataKeyId = `${dataKey}:${id}`

    await redisClient.rPush(dataKey, dataKeyId);
    //console.log(`rpush in ${dataKey} of ${dataKeyId}`);

    await redisClient.hSet(dataKeyId, {
        "url": entryKey,
        "encoded": entryValue
    });
    //console.log(`hmset on ${dataKeyId}`);
}

exports.UpdateTaskStatus = async function (key, status) {
    const redisClient = await getClient();
    let currentStatus = await redisClient.hGet(key, "status");
    await redisClient.hSet(key, 'status', status);
    console.log(`[${key}] status (${currentStatus}) changed to -> ${status}`)
}

exports.UpdateTaskStatusWithReason = async function (key, status, reason) {
    const redisClient = await getClient();
    let currentStatus = await redisClient.hGet(key, "status");
    await redisClient.hSet(key, 'status', status);
    console.log(`[${key}] status (${currentStatus}) changed to -> ${status}`)

    // used to add error details if any, or any other info to decorate status
    let currentReason = await redisClient.hGet(key, "reason");
    await redisClient.hSet(key, 'reason', reason);
    console.log(`[${key}] reason (${currentReason}) changed to -> ${reason}`)
}

exports.GetTask = async function (key) {
    const redisClient = await getClient();
    let status = await redisClient.hGet(key, "status");

    console.log(`[DB] GetTask: Retrieving task ${key}, status="${status}"`);

    // todo implement as switch
    if (status === "queued") {
        console.log(`[DB] GetTask: Task ${key} is still queued`);
        return ["queued", null]
    } else if (status === "error") {
        let error = await redisClient.hGet(key, "error");
        let reason = await redisClient.hGet(key, "reason");
        console.log(`[DB] GetTask: Task ${key} has error, reason="${reason}"`);
        return ["error", reason]
    } else {
        // todo check status === done
        let dataKey = `${key}:extruded`;

        try {
            let extruded_entries = await redisClient.lRange(dataKey, 0, -1);
            let result = []
            for (let entryKey of extruded_entries) {
                let value = await redisClient.hGetAll(entryKey);
                result.push(value)
            }

            console.log(`[DB] GetTask: Task ${key} has ${result.length} extruded entries`);
            return [status, result];
        } catch (e) {
            console.log(`[DB] GetTask error for ${key}:${e}`);
            return ["error", e]
        }
    }
}

exports.GetCredentials = async function (key) {
    const redisClient = await getClient();
    let status = await redisClient.hGet(key, "status");

    // get number of creds
    let _num = await redisClient.hGet(key, "creds_count");
    let num = parseInt(_num);
    let res = [];
    for (let i = 0; i < num; i++) {
        let _r = await redisClient.hGetAll(`${key}:creds:${i}`);
        res.push(_r);
    }
    // todo implement as switch
    if (res.length === num) {
        return res;
    } else {
        console.log(`getcredentials error:`);
        return ["error", "getcredentials"];
    }
}