import dgram, { RemoteInfo } from 'dgram';
import os from 'os';
import Device from './device';

// Export all TypeScript classes, to avoid internal (node-broadlink/dist/...) import for Liberty users */
export * from './device';


interface NetworkInterfaceModel {
  address: string;
  broadcastAddress: string;
}

type NetworkInterface = NetworkInterfaceModel | NetworkInterfaceModel[];


export function getNetworkInterfaces(interfaces?: NetworkInterface): NetworkInterfaceModel[] {
  return interfaces && (!Array.isArray(interfaces) || interfaces.length > 0)
    ? ((Array.isArray(interfaces) && interfaces) || [interfaces]).flat().map(
      (arg) =>
        ({
          address: arg.address || arg,
          broadcastAddress: arg.broadcastAddress || '255.255.255.255',
        } as NetworkInterfaceModel),
    )
    : Object.values(os.networkInterfaces())
      .flat()
      .filter(
        (networkInterface) => networkInterface && networkInterface.family === 'IPv4' && !networkInterface.internal,
      )
      .map((networkInterface) => {
        const address = networkInterface!.address.split('.');
        return {
          address: networkInterface!.address,
          broadcastAddress: networkInterface!.netmask
            .split('.')
            .map((byte, index) => (byte === '255' ? address[index] : '255'))
            .join('.'),
        } as NetworkInterfaceModel;
      });
}

export function setup(
  ssid: string,
  password: string,
  securityMode: number,
  networkInterfaces?: NetworkInterfaceModel,
): Promise<{
  ssid: string;
  password: string;
  securityMode: string;
  interfaces: NetworkInterfaceModel[];
}> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.concat([
      Buffer.alloc(68),
      Buffer.of(...ssid.split('').map((letter) => letter.charCodeAt(0))),
      Buffer.alloc(100 - 68 - ssid.length),
      Buffer.of(...password.split('').map((letter) => letter.charCodeAt(0))),
      Buffer.alloc(0x88 - 100 - password.length),
    ]);
    payload[0x26] = 0x14;
    payload[0x84] = ssid.length;
    payload[0x85] = password.length;
    payload[0x86] = securityMode;

    const checksum = payload.reduce((acc, b) => acc + b, 0xbeaf) & 0xffff;
    payload[0x20] = checksum & 0xff;
    payload[0x21] = (checksum >> 8) & 0xff;

    (
      Promise.all(
        getNetworkInterfaces(networkInterfaces).map(
          (networkInterface) =>
            new Promise((resolveSocketBound, rejectSocketBound) => {
              const socket = dgram.createSocket('udp4');
              socket.once('listening', () => {
                socket.setBroadcast(true);
                socket.send(payload, 0, payload.length, 80, networkInterface.broadcastAddress);
              });
              socket.on('error', (err) => {
                socket.close();
                rejectSocketBound(err);
              });
              socket.bind({ address: networkInterface.address }, () => {
                socket.close();
                resolveSocketBound(networkInterface);
              });
            }),
        ),
      ) as Promise<NetworkInterfaceModel[]>
    )
      .then((interfaces) => {
        resolve({
          ssid,
          password,
          securityMode: `${securityMode} (${['none', 'WEP', 'WPA1', 'WPA2', 'WPA1/2'][securityMode]})`,
          interfaces,
        });
      })
      .catch(reject);
  });
}

export function genDevice(
  deviceType: number,
  host: RemoteInfo,
  mac: number[],
  name?: string,
  isLocked?: boolean,
): Device {

  return new Device(host, mac, deviceType, undefined, undefined, name, isLocked);
}

export function discover(timeout = 500, interfaces?: NetworkInterface, discoverIpPort = 80): Promise<Device[]> {
  return new Promise((resolve) => {
    const devices: Device[] = [];
    const sockets = getNetworkInterfaces(interfaces).map((networkInterface) => {
      const cs = dgram.createSocket('udp4');

      cs.once('listening', () => {
        cs.setBroadcast(true);

        const address = networkInterface.address.split('.');
        const { port } = cs.address();
        const now = new Date();
        const timezone = now.getTimezoneOffset() / -3600;
        const year = now.getFullYear() - 1900;
        const packet = Buffer.alloc(0x30);

        if (timezone < 0) {
          packet[0x08] = 0xff + timezone - 1;
          packet[0x09] = 0xff;
          packet[0x0a] = 0xff;
          packet[0x0b] = 0xff;
        } else {
          packet[0x08] = timezone;
          packet[0x09] = 0;
          packet[0x0a] = 0;
          packet[0x0b] = 0;
        }
        packet[0x0c] = year & 0xff;
        packet[0x0d] = (year >> 8) & 0xff;
        packet[0x0e] = now.getMinutes();
        packet[0x0f] = now.getHours();
        packet[0x10] = ~~year % 100;
        packet[0x11] = now.getDay();
        packet[0x12] = now.getDay();
        packet[0x13] = now.getMonth();
        packet[0x18] = ~~address[0];
        packet[0x19] = ~~address[1];
        packet[0x1a] = ~~address[2];
        packet[0x1b] = ~~address[3];
        packet[0x1c] = port & 0xff;
        packet[0x1d] = (port >> 8) & 0xff;
        packet[0x26] = 6;

        const checksum = packet.reduce((acc, b) => acc + b, 0xbeaf) & 0xffff;
        packet[0x20] = checksum & 0xff;
        packet[0x21] = (checksum >> 8) & 0xff;

        cs.send(packet, 0, packet.length, discoverIpPort, networkInterface.broadcastAddress);
      });

      cs.on('message', (msg, rinfo) => {
        const deviceType = msg[0x34] | (msg[0x35] << 8);
        const mac = [...msg.subarray(0x3a, 0x40)];
        if (!devices.some((device) => device.mac.toString() === mac.toString())) {
          const nameSlice = msg.slice(0x40, 0x7e);
          const name = nameSlice.slice(0, nameSlice.indexOf(0x00)).toString('utf8');
          const isLocked = !!msg[0x7f];

          devices.push(genDevice(deviceType, rinfo, mac, name, isLocked));
        }
      });

      cs.bind({ address: networkInterface.address });
      return cs;
    });

    setTimeout(() => {
      sockets.forEach((socket) => socket.close());
      resolve(devices);
    }, ~~timeout);
  });
}