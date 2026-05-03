# Rust+ to Home Assistant via MQTT

This script acts as a bridge between the **Rust** mobile app ecosystem (**Rust+**) and **Home Assistant**. It allows you to monitor and control in-game devices like Smart Switches, Alarms, and Storage Monitors directly from your smart home dashboard.

## Features

*   **Auto-Discovery:** Automatically adds devices to Home Assistant via MQTT Discovery.
*   **Smart Switches:** Toggle switches in-game from Home Assistant.
*   **Smart Alarms:** Receive notifications in Home Assistant when your in-game alarms are triggered.
*   **Storage Monitors:** Track item counts in boxes/tool cupboards.
*   **FCM Integration:** Automatically handles server and entity pairing when you click "Pair" in the Rust pause menu or on a device.

## Prerequisites

1.  **Node.js** (v16 or higher recommended).
2.  **MQTT Broker** (e.g., Mosquitto, or the Home Assistant MQTT Add-on).
3.  **Rust+ Credentials:** You must register your "device" to receive FCM notifications from Facepunch.

## Installation & Setup

### 1. Clone and Install
```bash
git clone https://github.com/yourusername/rustplus-ha-bridge.git
cd rustplus-ha-bridge
npm install
```

### 2. Register FCM (Rust+ Credentials)
You need to link this script to a "virtual phone" to receive pairing notifications. Run the following command and follow the instructions in your terminal:
```bash
npx @liamcottle/rustplus.js fcm-register
```
This will generate a `rustplus.config.json` file in your root directory.

### 3. Configure MQTT
The script expects MQTT configuration to keep it separate from the Rust credentials. **Do not** add this to `rustplus.config.json` if you plan to share that file. Instead, ensure your `rustplus.config.json` looks like this:

```json
{
  "fcm_credentials": {
    "gcm": {
      "androidId": "your_id",
      "securityToken": "your_token"
    }
  },
  "mqtt": {
    "url": "mqtt://YOUR_MQTT_BROKER_IP:1883",
    "username": "your_username",
    "password": "your_password"
  }
}
```

### 4. Run the Script
```bash
node .
```

## How to Use

1.  **Link Server:** Open Rust, go to the Esc menu -> **Rust+**, and click **Pair Service**. The script will catch the notification, save the server details to `server.json`, and connect.
2.  **Add Devices:** To add a Smart Switch, Alarm, or Storage Monitor, simply use the **Pair** button on the device in-game. 
3.  **Home Assistant:** The device will automatically appear in Home Assistant under the "MQTT" integration.

## Libraries Used

This project relies on the following open-source libraries:
*   [@liamcottle/rustplus.js](https://github.com/liamcottle/rustplus.js) - The core library for interacting with Rust+ servers.
*   [@liamcottle/push-receiver](https://github.com/liamcottle/push-receiver) - Used to listen for Google FCM notifications.
*   [mqtt](https://github.com/mqttjs/MQTT.js) - For communication with the Home Assistant MQTT broker.

## License

This repository is licensed under the **MIT License**. Feel free to use, modify, and distribute it as you wish.

**Disclaimer:** *This is an unofficial tool and is not affiliated with Facepunch Studios. Use at your own risk.*
