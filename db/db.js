const redis = require("redis");
const shortid = require("shortid");
const util = require('util');

exports.CheckRedis = function() {
    const checkRedis = redis.createClient();
    checkRedis.on("error", function(error) {
        console.error("error: cannot connect to Redis at tcp://127.0.0.1:6379\nexiting now...");
        process.exit(1)
    });
}
// redis keyspace:
// task:<type>:<short-id> ...
// task:github:PPBqWA9
// related cookies are another HMSET like:
// task:<type>:<short-id>
exports.AddTask = function (name, task, cookies) {
    const client = redis.createClient();
    client.on("error", function(error) {
        console.error("redis error: " + error);
    });

    const id = shortid.generate();

    // NOTE: cookies is base64 encoded JSON stringify of all cookies array. makes redis mapping less complicated
    //console.log(`Adding to redis task ${task}:${id} with cookies`)

    const key = `task:${task}:${id}`;
    client.hmset([key, "name", name, "cookies", cookies, "status", "queued"], function(err, res) {
        // TODO catch errors if any
    });

    return key;
}

exports.AddExtrudedData = function(key, entryKey, entryValue) {
    const client = redis.createClient();
    client.on("error", function(error) {
        console.error("redis error: " + error);
    });

    let dataKey = `${key}:extruded`
    client.hmset([dataKey, entryKey, entryValue], function(err, res) {
        // TODO catch errors if any
    });
}

exports.UpdateTaskStatus = async function (key, status) {
    const client = redis.createClient();

    client.on("error", function(error) {
        console.error("redis error: " + error);
    });

    const hget = util.promisify(client.hget).bind(client);
    let currentStatus = await hget(key, "status");
    client.hmset([key, 'status', status], function(err, res) {});
    console.log(`[${key}] status (${currentStatus}) changed to -> ${status}`)

}

exports.UpdateTaskStatusWithReason = async function (key, status, reason) {
    const client = redis.createClient();

    client.on("error", function(error) {
        console.error("redis error: " + error);
    });

    const hget = util.promisify(client.hget).bind(client);
    let currentStatus = await hget(key, "status");
    client.hmset([key, 'status', status], function(err, res) {});
    console.log(`[${key}] status (${currentStatus}) changed to -> ${status}`)

    // used to add error details if any, or any other info to decorate status
    let currentReason = await hget(key, "reason");
    client.hmset([key, 'reason', reason], function(err, res) {});
    console.log(`[${key}] reason (${currentReason}) changed to -> ${reason}`)

}

exports.GetTask = async function (key) {
    const client = redis.createClient();

    client.on("error", function(error) {
        console.error("redis error: " + error);
    });

    // NOTE: cookies is base64 encoded JSON stringify of all cookies array. makes redis mapping less complicated
    const hgetall = util.promisify(client.hgetall).bind(client);
    const hget = util.promisify(client.hget).bind(client);

    let status = await hget(key, "status");
    // todo implement as switch
    if (status === "queued") {
        return ["queued", null]
    }else if(status === "error"){
        let error = await hget(key, "error");
        let reason = await hget(key, "reason");
        return ["error", reason]
    }else{
        // todo check status === done
        let dataKey = `${key}:extruded`;

        // NOTE we need to promisify the redis-node calls to make it fully async and properly return values
        try {
            let value = await hgetall(dataKey);
            return [status, value];
        } catch (e) {
            console.log(`getTask error:${e}`);
            return ["error", e]
        }
    }
}

