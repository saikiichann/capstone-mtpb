/**
 * @format
 */

import React from 'react';
import { ActivityIndicator } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  // The start check is async (splash first). Not signed in → Login.
  const splash = () => tree!.root.findAllByType(ActivityIndicator).length;
  for (let i = 0; i < 20 && splash() > 0; i++) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
  expect(splash()).toBe(0);
  // Unmount so the shift timer stops.
  await ReactTestRenderer.act(async () => tree!.unmount());
});
