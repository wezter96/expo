import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { JoinGroupView } from '../../src/components/JoinGroupView';

/** Deep-link target for kinly://join/<code> — prefills and auto-joins. */
export default function JoinGroupByLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinGroupView initialCode={code} autoJoin />;
}
