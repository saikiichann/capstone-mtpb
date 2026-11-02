/* Session record for the IT Admin's Session Monitor (src/session.js). */
import { Platform } from 'react-native';
import { addDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  CLIENT_IP_URL,
  clientIp,
  describeDevice,
  endSession,
  setRevokeHandler,
  startSession,
} from '../src/session';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ip: '203.0.113.7' }) }));
  addDoc.mockImplementation(async () => ({ id: 'sess-1' }));
});

test('device label names the app, phone and Android version', () => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  Platform.constants.Brand = 'samsung';
  Platform.constants.Model = 'SM-A125F';
  Platform.constants.Release = '12';
  expect(describeDevice()).toBe('Enforcer app · Samsung SM-A125F (Android 12)');
  os.restore();
});

test('login records a session with the IP from the admin site', async () => {
  await startSession({ uid: 'u-clamp', name: 'Cleo Clamp' });
  expect(global.fetch).toHaveBeenCalledWith(CLIENT_IP_URL, expect.anything());
  const data = addDoc.mock.calls[0][1];
  expect(data).toMatchObject({
    uid: 'u-clamp',
    userId: 'u-clamp',
    userName: 'Cleo Clamp',
    role: 'clamping-staff',
    ipAddress: '203.0.113.7',
    active: true,
  });
  expect(data.device).toMatch(/^Enforcer app · /);
  expect(clientIp()).toBe('203.0.113.7');
  await endSession();
});

test('no internet for the IP: session still recorded, IP shows —', async () => {
  global.fetch = jest.fn(async () => {
    throw new Error('offline');
  });
  await startSession({ uid: 'u-clamp', name: 'Cleo Clamp' });
  expect(addDoc.mock.calls[0][1].ipAddress).toBe('—');
  await endSession();
});

test('revoked by the IT Admin calls the revoke handler', async () => {
  let push;
  onSnapshot.mockImplementation((_ref, next) => {
    push = next;
    return () => {};
  });
  const handler = jest.fn();
  setRevokeHandler(handler);
  await startSession({ uid: 'u-clamp', name: 'Cleo Clamp' });
  push({ exists: () => true, data: () => ({ revoked: false }) });
  expect(handler).not.toHaveBeenCalled();
  push({ exists: () => true, data: () => ({ revoked: true }) });
  expect(handler).toHaveBeenCalledTimes(1);
  setRevokeHandler(null);
});

test('logout closes the session', async () => {
  await startSession({ uid: 'u-clamp', name: 'Cleo Clamp' });
  await endSession();
  expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ active: false }));
  expect(clientIp()).toBe('—');
});
