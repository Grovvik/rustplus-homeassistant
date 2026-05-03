const fs = require('fs');
const RustPlus = require('@liamcottle/rustplus.js');
const PushReceiverClient = require('@liamcottle/push-receiver/src/client');
const mqtt = require('mqtt');
const config = require('./rustplus.config.json'); // with mqtt config

const SERVER_FILE = './server.json';
const ENTITIES_FILE = './entities.json';

let serverData = fs.existsSync(SERVER_FILE) ? JSON.parse(fs.readFileSync(SERVER_FILE)) : {};
let entities = fs.existsSync(ENTITIES_FILE) ? JSON.parse(fs.readFileSync(ENTITIES_FILE)) : {};
let rustplus;

process.on('uncaughtException', (err) => {
    if (err.message.includes('missing required')) {
        console.warn('Ignored Protobuf error');
    } else {
        console.error('Critical error:', err);
        process.exit(1);
    }
});

const mqttConfig = config.mqtt || {
    url: 'mqtt://127.0.0.1:1883',
    username: '',
    password: ''
};

const client = mqtt.connect(mqttConfig.url, { 
    password: mqttConfig.password, 
    username: mqttConfig.username 
});

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe('rustplus/entity/+/set');
});

client.on('error', (err) => {
    console.error('MQTT connection error:', err.message);
});

client.on('message', (topic, message) => {
    const text = message.toString();

    if (!rustplus || !rustplus.websocket || rustplus.websocket.readyState !== 1) return;

    const topicParts = topic.split('/');
    
    if (topicParts[0] === 'rustplus' && topicParts[1] === 'entity' && topicParts[3] === 'set') {
        const entityId = parseInt(topicParts[2], 10);
        if (text === 'on') {
            rustplus.turnSmartSwitchOn(entityId);
        } else if (text === 'off') {
            rustplus.turnSmartSwitchOff(entityId);
        }
    }
});

function registerInHA(entityId, name, type) {
    let haType = 'sensor';
    if (type == 1) haType = 'switch';

    const configTopic = `homeassistant/${haType}/rustplus_${entityId}/config`;
    
    const payload = {
        name: `Rust: ${name}`,
        unique_id: `rustplus_${entityId}`,
        state_topic: `rustplus/entity/${entityId}/status_ha`,
        device: {
            identifiers: [`rustplus_${entityId}`],
            name: name,
            manufacturer: 'Facepunch',
            model: type.toString()
        }
    };

    if (haType === 'switch') {
        payload.command_topic = `rustplus/entity/${entityId}/set`;
        payload.payload_on = 'on';
        payload.payload_off = 'off';
        payload.state_on = 'on';
        payload.state_off = 'off';
    }

    if (type === 'StorageMonitor' || type == 3) {
        payload.json_attributes_topic = `rustplus/entity/${entityId}/data`;
        payload.value_template = '{{ value_json.items | length }} items';
    }

    client.publish(configTopic, JSON.stringify(payload), { retain: true });
}

function connectRustPlus() {
    if (rustplus) {
        rustplus.disconnect();
    }

    console.log(`Connecting to Rust+ server: ${serverData.ip}:${serverData.port}`);
    rustplus = new RustPlus(serverData.ip, serverData.port, serverData.playerId, serverData.playerToken);

    rustplus.on('connected', () => {
        console.log('Connected to Rust+ server');
        for (const id in entities) {
            rustplus.getEntityInfo(id);
        }
    });

    rustplus.on('message', (message) => {
        if (message?.broadcast?.cameraRays) {
            return; 
        }

        if (message?.broadcast?.entityChanged) {
            const entityId = message.broadcast.entityChanged.entityId;
            const payload = message.broadcast.entityChanged.payload;
        
            if (payload && payload.value !== undefined) {
                const state = payload.value ? 'on' : 'off';
                client.publish(`rustplus/entity/${entityId}/status`, state);
                client.publish(`rustplus/entity/${entityId}/status_ha`, state, { retain: true });
            }
            
            if (payload && payload.items) {
                client.publish(`rustplus/entity/${entityId}/data`, JSON.stringify(payload), { retain: true });
            }
        }
    });

    rustplus.connect();
}

async function startFCM() {
    const androidId = config.fcm_credentials?.gcm?.androidId;
    const securityToken = config.fcm_credentials?.gcm?.securityToken;

    if (!androidId || !securityToken) {
        console.error('FCM credentials missing in config file. Cannot start listener.');
        return;
    }

    const fcmClient = new PushReceiverClient(androidId, securityToken, []);

    fcmClient.on('ON_DATA_RECEIVED', (data) => {
        const channelId = data.appData.find(item => item.key === 'channelId')?.value || 
                          data.appData.find(item => item.key === 'gcm.notification.android_channel_id')?.value;
        const bodyData = data.appData.find(item => item.key === 'body')?.value;

        if (bodyData) {
            try {
                const payload = JSON.parse(bodyData);

                if (payload.type === 'server') {
                    console.log(`\nNew server paired successfully!`);
                    console.log(`Server: ${payload.name}`);
                    console.log(`IP: ${payload.ip}:${payload.port}`);

                    serverData = {
                        ip: payload.ip,
                        port: payload.port,
                        playerId: payload.playerId,
                        playerToken: payload.playerToken
                    };
                    fs.writeFileSync(SERVER_FILE, JSON.stringify(serverData, null, 2));

                    connectRustPlus();
                } 
                else if (channelId === 'pairing' && payload.type === 'entity' && payload.entityId) {
                    console.log(`\nNew device paired successfully!`);
                    console.log(`Name: ${payload.entityName}`);
                    console.log(`ID: ${payload.entityId}`);
                    
                    const entityId = parseInt(payload.entityId, 10);
                    
                    entities[entityId] = {
                        name: payload.entityName,
                        type: payload.entityType
                    };
                    fs.writeFileSync(ENTITIES_FILE, JSON.stringify(entities, null, 2));
                    registerInHA(entityId, payload.entityName, payload.entityType);

                    if (rustplus && rustplus.websocket && rustplus.websocket.readyState === 1) {
                        rustplus.getEntityInfo(entityId);
                    }
                }
            } catch (e) {
                console.error("Error parsing FCM notification body:", e.message);
            }
        }

        if (channelId === 'alarm') {
            const title = data.appData.find(item => item.key === 'title')?.value || 
                          data.appData.find(item => item.key === 'gcm.notification.title')?.value;
            const message = data.appData.find(item => item.key === 'message')?.value || 
                            data.appData.find(item => item.key === 'gcm.notification.body')?.value;
            
            client.publish('rustplus/alarm/title', title || 'Rust Alarm');
            client.publish('rustplus/alarm/message', message || 'Triggered');
        }
    });

    await fcmClient.connect();
    console.log("FCM Listener started - Waiting for Pair button in game...");
}

if (serverData.playerToken) connectRustPlus();
startFCM().catch(console.error);
