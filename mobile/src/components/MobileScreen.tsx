/**
 * MobileScreen — Shared layout wrapper and design tokens.
 * Colours and design language mirror the live ai.croplifescience.com web app
 * (green-dominant agricultural palette from the website CSS).
 */
import React, { type ReactNode } from 'react';
import {
  ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** Design tokens extracted from ai.croplifescience.com CSS */
export const AppColors = {
  // Primary greens (from --green, home-panel, auth-visual gradient)
  green:       '#3e7025',   // primary green — main brand colour
  greenDark:   '#173b1b',   // deep forest green (hero gradient start)
  greenMid:    '#4b7f21',   // auth-blue replacement
  greenLight:  '#72a52f',   // gradient end / lime accent
  lime:        '#cbe968',   // --lime accent chip colour
  limePale:    '#edf3d7',   // pale lime background chips
  // UI tones
  ink:         '#1d3322',   // dark text (--ink on green theme)
  muted:       '#71806d',   // secondary text
  mutedLight:  '#94a096',   // placeholder/hint text
  bg:          '#f2f6ed',   // page background (auth-shell bg)
  bgAlt:       '#f8fbf3',   // card inner bg
  card:        '#ffffff',   // white card surface
  line:        '#d7e4cf',   // border colour (green-tinted)
  lineLight:   '#e0e9dc',   // lighter border
  // Accents
  pale:        '#eff7df',   // auth-sky equivalent (pale green)
  paleBlue:    '#e9f5fc',   // optional light blue accent
  // Semantic
  error:       '#a22b2b',
  errorBg:     '#fff3f3',
  success:     '#2c6b1f',
  successBg:   '#eaf7e4',
  // Legacy alias kept for compatibility
  blue:        '#064878',   // only used for weather/coupons accent now
  navy:        '#173b1b',
  white:       '#ffffff',
};

export function MobileScreen({
  title, subtitle, onBack, children, scroll = true,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={AppColors.greenDark} />
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={AppColors.white} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpace} />
        )}
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.backSpace} />
      </View>
      {scroll
        ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{body}</ScrollView>
        : body}
    </SafeAreaView>
  );
}

/** Shared reusable styles — all matching the website's green design language */
export const shared = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: AppColors.line,
    padding: 18,
    shadowColor: AppColors.greenDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  sectionTitle: {
    color: AppColors.ink,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800',
  },
  body: {
    color: AppColors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    color: AppColors.ink,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    minHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: AppColors.line,
    backgroundColor: AppColors.bgAlt,
    paddingHorizontal: 16,
    fontSize: 16,
    color: AppColors.ink,
  },
  primary: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: AppColors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
    shadowColor: AppColors.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 5,
  },
  primaryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: AppColors.pale,
  },
  chipText: {
    color: AppColors.green,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  header: {
    minHeight: 78,
    backgroundColor: AppColors.greenDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpace: { width: 42 },
  heading: { flex: 1, alignItems: 'center' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  subtitle: { color: '#cce989', fontSize: 12, marginTop: 3 },
  scroll: { paddingBottom: 30 },
  body: { padding: 16, gap: 14 },
});
