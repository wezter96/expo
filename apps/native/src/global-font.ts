/**
 * Applies the Atkinson Hyperlegible typeface globally to every <Text> and
 * <TextInput> without touching each StyleSheet.
 *
 * React Native ignores `fontWeight` when a custom `fontFamily` is set (it loads
 * the exact font file instead), so a single default family would flatten our
 * bold hierarchy. Instead we read each element's merged `fontWeight` and pick
 * the matching Atkinson file — regular or bold — preserving the type scale the
 * whole app relies on for legibility.
 */
import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { fontFamily } from './theme';

function isBold(weight: unknown): boolean {
  if (weight === 'bold') return true;
  const n = typeof weight === 'string' ? parseInt(weight, 10) : typeof weight === 'number' ? weight : NaN;
  return !Number.isNaN(n) && n >= 600;
}

function patch(Component: any) {
  const original = Component.render;
  if (!original || Component.__kinlyFontPatched) return;
  Component.__kinlyFontPatched = true;
  Component.render = function (...args: any[]) {
    const element = original.apply(this, args);
    if (!element) return element;
    const flat = StyleSheet.flatten(element.props.style) || {};
    const family = isBold(flat.fontWeight) ? fontFamily.bold : fontFamily.regular;
    return React.cloneElement(element, {
      style: [element.props.style, { fontFamily: family }],
    });
  };
}

let applied = false;
/** Idempotent; call once after the Atkinson fonts have loaded. */
export function applyGlobalFont() {
  if (applied) return;
  applied = true;
  patch(Text as any);
  patch(TextInput as any);
}
