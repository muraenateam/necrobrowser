const glob = require('glob');
const path = require('path');
const helper = require('./../tasks/helpers/necrohelp')
const c = require('chalk');
const log = require('./../lib/logger');

exports.LoadTasks = () => {
    let necroTasks = {}

    glob.sync( './tasks/**/*.js' ).forEach( function( file ) {
        let req = require( path.resolve( file ) );

        if(file.includes('necrotask.js')){
            let taskType = file.split('/')[2]
            let exps = Object.getOwnPropertyNames(req)  // map of the list of module exports
            necroTasks[taskType] = exps

            let typeOk = helper.IsAlphanumeric(taskType)

            if(!typeOk){
                console.log('error: task type must be alphanumeric')
                process.exit(1)
            }

            console.log(`${c.green("[loader]")} parsed ${exps.length} necrotasks for [${taskType}]:\n ${exps.join('\n ')}`)
        }
    });

    Object.keys(necroTasks).forEach(function(key) {
        necroTasks[key + '__Tasks'] = eval(`require('./../tasks/${key}/necrotask');`);
    });

    return necroTasks;
}

// checks if task type and name are alphanumeric
// and also if task type/name can be called since they exists as functions
exports.ValidateTask = async(taskType, taskName, taskParams, necroTasks) => {

    if ((typeof taskType === 'undefined') || (typeof taskName === 'undefined') || (typeof taskParams === 'undefined')){
        console.log('error: task type/name/params undefined')
        return false
    }

    let typeOk = await helper.IsAlphanumeric(taskType)
    let nameOk = await helper.IsAlphanumeric(taskName)

    if(!typeOk || !nameOk){
        console.log('error: task type/name must be alphanumeric')
        return false
    }

    let isGoodTask = false
    if (typeof necroTasks[taskType] === 'object'){
        if(necroTasks[taskType].includes(taskName)){
            isGoodTask = true
        }
    }

    if(!isGoodTask){
        console.log('error: task type/name not supported. see GET /tasks output')
        return false
    }

    return true
}

// Wraps a task function with error handling to prevent crashes
exports.WrapTaskWithErrorHandler = (taskFn, taskType, taskName, db) => {
    return async (taskData) => {
        const taskId = taskData.data && taskData.data[0] ? taskData.data[0] : 'unknown';

        try {
            log.LogInfo(`[${taskId}] Starting task execution: ${taskType}.${taskName}`);

            // Execute the actual task
            await taskFn(taskData);

            log.LogSuccess(`[${taskId}] Task completed successfully: ${taskType}.${taskName}`);
        } catch (error) {
            log.LogError('TASK EXECUTION ERROR CAUGHT', {
                'Task ID': taskId,
                'Task Type': `${taskType}.${taskName}`,
                'Error': error.message,
                'Stack': error.stack,
                'Time': new Date().toISOString()
            });

            // Update task status in Redis
            try {
                if (taskId !== 'unknown') {
                    await db.UpdateTaskStatusWithReason(taskId, 'error', error.message || 'Task execution failed');
                }
            } catch (dbErr) {
                console.error(c.red(`[Task Wrapper] Failed to update task status in Redis: ${dbErr.message}`));
            }

            // Re-throw to let cluster handle it (will trigger taskerror event)
            throw error;
        }
    };
}
