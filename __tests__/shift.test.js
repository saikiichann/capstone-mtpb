/* Stay logged in for one shift (src/shift.js) and the app start (src/boot.js). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '../src/firebase';
import {
  SHIFT_HOURS,
  clearShift,
  readShift,
  setShiftSession,
  shiftExpired,
  startShift,
} from '../src/shift';
import { decideStart, shiftOver } from '../src/boot';
import { endSession } from '../src/session';

const H = 3600000;
const user = { uid: 'u-francis' };
const activeUser = { name: 'Francis Juan Santos', role: 'clamping-staff', status: 'active' };
const snap = (data) => ({ exists: () => !!data, data: () => data });

beforeEach(async () => {
  jest.clearAllMocks();
  AsyncStorage.__store.clear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ip: '203.0.113.7' }) }));
  addDoc.mockImplementation(async () => ({ id: 'sess-new' }));
  onSnapshot.mockImplementation(() => () => {});
  auth.currentUser = null;
});

afterEach(async () => {
  await endSession();
});

test('a shift lasts 12 hours', () => {
  expect(SHIFT_HOURS).toBe(12);
  const now = Date.now();
  expect(shiftExpired({ loginAt: now - 11 * H }, now)).toBe(false);
  expect(shiftExpired({ loginAt: now - 12 * H }, now)).toBe(true);
  expect(shiftExpired(null, now)).toBe(true);
  expect(shiftExpired({}, now)).toBe(true);
});

test('login saves the shift; logout clears it', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' });
  await setShiftSession('sess-1');
  expect(await readShift()).toMatchObject({ uid: 'u-francis', name: 'Francis', sessionId: 'sess-1' });
  await clearShift();
  expect(await readShift()).toBeNull();
});

test('not signed in → Login', async () => {
  expect((await decideStart(null)).route).toBe('Login');
});

test('within the shift → Home, same Session Monitor record (no new one)', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' }, Date.now() - 2 * H);
  await setShiftSession('sess-1');
  // users/{uid} is read first, then sessions/{id}
  getDoc
    .mockImplementationOnce(async () => snap(activeUser))
    .mockImplementationOnce(async () => snap({ active: true, ipAddress: '1.2.3.4' }));
  const start = await decideStart(user);
  expect(start.route).toBe('ClampDashboard');
  expect(start.params).toEqual({ officerName: 'Francis Juan Santos', officerUid: 'u-francis' });
  expect(addDoc).not.toHaveBeenCalled();
  expect(updateDoc).toHaveBeenCalled(); // lastActive touched
});

test('shift over → logged out, back to Login with a message', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' }, Date.now() - 13 * H);
  await setShiftSession('sess-1');
  const start = await decideStart(user);
  expect(start).toMatchObject({ route: 'Login', notice: 'shift' });
  expect(signOut).toHaveBeenCalled();
  expect(updateDoc.mock.calls[0][1]).toMatchObject({ active: false });
  expect(await readShift()).toBeNull();
});

test('account disabled by the IT Admin → Login', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' });
  getDoc.mockImplementationOnce(async () => snap({ ...activeUser, status: 'inactive' }));
  const start = await decideStart(user);
  expect(start).toMatchObject({ route: 'Login', notice: 'account' });
  expect(signOut).toHaveBeenCalled();
});

test('session revoked by the IT Admin → Login', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' });
  await setShiftSession('sess-1');
  getDoc
    .mockImplementationOnce(async () => snap(activeUser))
    .mockImplementationOnce(async () => snap({ active: true, revoked: true }));
  const start = await decideStart(user);
  expect(start).toMatchObject({ route: 'Login', notice: 'revoked' });
  expect(signOut).toHaveBeenCalled();
  expect(await readShift()).toBeNull();
});

test('offline at start → still Home with the saved name', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' });
  await setShiftSession('sess-1');
  getDoc.mockImplementation(async () => {
    throw new Error('offline');
  });
  const start = await decideStart(user);
  expect(start).toMatchObject({ route: 'ClampDashboard', params: { officerName: 'Francis' } });
});

test('another account signed in than the saved shift → Login', async () => {
  await startShift({ uid: 'someone-else', name: 'X' });
  expect((await decideStart(user)).route).toBe('Login');
});

test('shiftOver: only when signed in and past 12 hours', async () => {
  await startShift({ uid: 'u-francis', name: 'Francis' }, Date.now() - 13 * H);
  expect(await shiftOver()).toBe(false); // not signed in
  auth.currentUser = { uid: 'u-francis' };
  expect(await shiftOver()).toBe(true);
  await startShift({ uid: 'u-francis', name: 'Francis' });
  expect(await shiftOver()).toBe(false);
});
