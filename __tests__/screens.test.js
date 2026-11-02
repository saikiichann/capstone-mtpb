import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { doc, query, onSnapshot } from 'firebase/firestore';
import ClampActivityScreen from '../src/screens/ClampActivityScreen';
import ViolationDetailsScreen from '../src/screens/ViolationDetailsScreen';
import ClampDashboardScreen from '../src/screens/ClampDashboardScreen';
import EditProfileScreen from '../src/screens/EditProfileScreen';
import SuccessScreen from '../src/screens/SuccessScreen';
import LoginScreen from '../src/screens/LoginScreen';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));

const H = 3600000;
const now = Date.now();
const ts = (ms) => ({ toMillis: () => ms });
const sample = [
  { id: 'a', cin: 'CLMP-1', plateNo: 'AAA 111', violationType: 'Obstruction', recordedAt: ts(now - H), paymentStatus: 'Verified', releaseStatus: 'Released', releasedAt: ts(now), totalPaid: 900, fineAmount: 900 },
  { id: 'b', cin: 'CLMP-2', plateNo: 'BBB 222', violationType: 'Double Parking', recordedAt: ts(now - 40 * H), paymentStatus: 'Unpaid', releaseStatus: 'Pending', fineAmount: 900, clampId: 'A-21' },
  { id: 'c', cin: 'CLMP-3', plateNo: 'CCC 333', violationType: 'Illegal Parking', recordedAt: ts(now - 2 * H), paymentStatus: 'Unpaid', releaseStatus: 'Pending', fineAmount: 900, clampId: '20-01',
    address: { street: 'Dapitan St', barangay: 'Barangay 471', district: 'Sampaloc', city: 'Manila', accuracyM: 8 },
    locationCoords: { lat: 14.61, lng: 120.99 }, photoUrl: 'https://example.test/p.jpg', photoStamped: false, officer: 'Ed' },
  { id: 'd', cin: 'CLMP-4', plateNo: 'DDD 444', violationType: 'Obstruction', recordedAt: ts(now - 3 * H), paymentStatus: 'Pending Verification', releaseStatus: 'Pending', fineAmount: 900, totalPaid: 900 },
];
const userDoc = { name: 'Juan Dela Cruz', email: 'j.delacruz@mtpb.gov.ph', username: 'j.delacruz', role: 'clamping-staff', status: 'active' };

// doc() and query() return tagged refs; onSnapshot answers by kind.
beforeEach(() => {
  doc.mockImplementation((_db, col, id) => ({ kind: 'doc', col, id }));
  query.mockImplementation(() => ({ kind: 'query' }));
  onSnapshot.mockImplementation((ref, next) => {
    if (ref.kind === 'doc') {
      const data = ref.col === 'users' ? userDoc : sample.find((v) => v.id === ref.id);
      next({ id: ref.id, exists: () => !!data, data: () => data });
    } else {
      next({ docs: sample.map((d) => ({ id: d.id, data: () => d })) });
    }
    return () => {};
  });
});

const texts = (tree) =>
  tree.root
    .findAll((n) => n.type === 'Text')
    .map((n) => n.children.filter((c) => typeof c === 'string').join(''));

const render = async (el) => {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(el);
  });
  return tree;
};
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn(), reset: jest.fn(), replace: jest.fn(), setParams: jest.fn() });

test('Activity: needs-action first, 5 chips with counts, exact state on each row', async () => {
  const tree = await render(<ClampActivityScreen navigation={nav()} route={{ params: { officerUid: 'u1' } }} />);
  const t = texts(tree);
  expect(t.filter((x) => /^CLMP-\d ·/.test(x)).map((x) => x.split(' ')[0]).slice(0, 3)).toEqual(['CLMP-2', 'CLMP-3', 'CLMP-4']);
  ['All', 'Overdue', 'Unpaid', 'For Verification', 'For Release'].forEach((c) => expect(t).toContain(c));
  expect(t).toContain('Needs action first');
  expect(t.some((x) => /before ₱2,000/.test(x))).toBe(true);
  expect(t).toContain('Released'); // exact state pill on the released row
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Activity: sort button switches to dates, grouped by day', async () => {
  const tree = await render(<ClampActivityScreen navigation={nav()} route={{ params: { officerUid: 'u1' } }} />);
  const sortBtn = tree.root.findAll((n) => n.props.accessibilityLabel?.startsWith?.('Sort:'))[0];
  await ReactTestRenderer.act(async () => sortBtn.props.onPress());
  const t = texts(tree);
  expect(t).toContain('Newest first');
  expect(t.some((x) => /^(Today|Yesterday)/.test(x))).toBe(true); // day headers (Yesterday right after midnight)
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Home: name, ID, recent activity newest first', async () => {
  const tree = await render(<ClampDashboardScreen navigation={nav()} route={{ params: { officerUid: 'abcdefgh123', officerName: 'Juan' } }} />);
  const t = texts(tree);
  expect(t).toContain('Juan Dela Cruz');
  expect(t).toContain('ID ABCDEFGH');
  expect(t).toContain('JD');
  expect(t).toContain('Recent activity');
  const plates = t.filter((x) => /^[A-Z]{3} \d{3}$/.test(x));
  expect(plates.slice(0, 4)).toEqual(['AAA 111', 'CCC 333', 'DDD 444', 'BBB 222']);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Violation Details shows the exact location and the photo stamp', async () => {
  const tree = await render(<ViolationDetailsScreen navigation={nav()} route={{ params: { record: { docId: 'c' } } }} />);
  const t = texts(tree);
  expect(t).toContain('Unpaid');
  expect(t.filter((x) => x.includes('Dapitan St, Barangay 471, Sampaloc, Manila')).length).toBe(2);
  expect(t.some((x) => x.startsWith('MTPB Enforcer: Ed'))).toBe(true);
  expect(t).toContain('Open in Maps');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Profile: details are read-only, password and photo can change', async () => {
  const tree = await render(<EditProfileScreen navigation={nav()} route={{ params: { officerUid: 'abcdefgh123' } }} />);
  const t = texts(tree);
  expect(t).toContain('Only the IT Admin can change these.');
  expect(t).toContain('j.delacruz@mtpb.gov.ph');
  expect(t).toContain('Clamping Staff · District 3, Manila');
  expect(t).toContain('Change photo');
  expect(t).toContain('Update password');
  // Name is shown as text, not an input.
  const inputs = tree.root.findAll((n) => n.type === 'TextInput');
  expect(inputs).toHaveLength(3);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Submitted: summary and next actions', async () => {
  const n = nav();
  const tree = await render(
    <SuccessScreen
      navigation={n}
      route={{ params: { violationNo: 'CLMP-2026-0044', plate: 'NBC 1234', violations: ['Blocking Driveway'], clampId: 'A-20', penalty: 900, officerUid: 'u1', officerName: 'Juan' } }}
    />
  );
  const t = texts(tree);
  ['Violation recorded', 'NBC 1234', 'Blocking Driveway', 'CLMP-2026-0044', 'A-20', '₱900', 'Print ticket', 'Scan next clamp', 'Back to home'].forEach((x) =>
    expect(t).toContain(x)
  );
  const scanNext = tree.root.findAll((n2) => n2.props.onPress && texts({ root: n2 }).includes?.('Scan next clamp'));
  expect(scanNext.length).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Sign in: fields and forgot password sheet', async () => {
  const tree = await render(<LoginScreen navigation={nav()} />);
  const t = texts(tree);
  ['Enforcer App', 'Sign in', 'Username', 'Password', 'Forgot password?'].forEach((x) => expect(t).toContain(x));
  const forgot = tree.root.findAll((n) => n.props.onPress && n.findAll((c) => c.type === 'Text' && c.children.includes('Forgot password?')).length)[0];
  await ReactTestRenderer.act(async () => forgot.props.onPress());
  expect(texts(tree)).toContain('Call IT Admin · (02) 8888-1234');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('District 3 and the Team Leader badge come from User Management', async () => {
  const leader = { ...userDoc, assignedDistrict: 'District 3', isTeamLeader: true };
  onSnapshot.mockImplementation((ref, next) => {
    if (ref.kind === 'doc') {
      const data = ref.col === 'users' ? leader : sample.find((v) => v.id === ref.id);
      next({ id: ref.id, exists: () => !!data, data: () => data });
    } else {
      next({ docs: sample.map((d) => ({ id: d.id, data: () => d })) });
    }
    return () => {};
  });

  const home = await render(<ClampDashboardScreen navigation={nav()} route={{ params: { officerUid: 'u1' } }} />);
  const h = texts(home);
  expect(h).toContain('District 3, Manila');
  expect(h).toContain('Team Leader');
  await ReactTestRenderer.act(async () => home.unmount());

  const profile = await render(<EditProfileScreen navigation={nav()} route={{ params: { officerUid: 'u1' } }} />);
  expect(texts(profile)).toContain('Clamping Staff (Team Leader) · District 3, Manila');
  await ReactTestRenderer.act(async () => profile.unmount());
});

test('A member (not leader) has no Team Leader badge', async () => {
  const home = await render(<ClampDashboardScreen navigation={nav()} route={{ params: { officerUid: 'u1' } }} />);
  const h = texts(home);
  expect(h).not.toContain('Team Leader');
  expect(h).toContain('District 3, Manila');
  await ReactTestRenderer.act(async () => home.unmount());
});
