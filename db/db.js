const redis = require("redis");
const shortid = require("shortid");

// Create a singleton Redis client
let client = null;

async function getClient() {
    if (!client) {
        client = redis.createClient();
        client.on("error", function (error) {
            console.error("Redis error: " + error);
        });
        await client.connect();
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

    // NOTE: cookies is base64 encoded JSON stringify of all cookies array. makes redis mapping less complicated
    //console.log(`Adding to redis task ${task}:${id} with cookies`)

    const key = `task:${task}:${id}`;
    await redisClient.hSet(key, {
        "name": name,
        "cookies": cookies,
        "status": "queued"
    });

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

    // todo implement as switch
    if (status === "queued") {
        return ["queued", null]
    } else if (status === "error") {
        let error = await redisClient.hGet(key, "error");
        let reason = await redisClient.hGet(key, "reason");
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

            return [status, result];
        } catch (e) {
            console.log(`getTask error:${e}`);
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