/**
 * MobileScreen — Shared layout wrapper and design tokens.
 * Colours and design language mirror the live ai.croplifescience.com web app
 * (green-dominant agricultural palette from the website CSS).
 */
import React, { type ReactNode } from 'react';
import {
  ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View, Image
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlobalHeader from './GlobalHeader';

/** Design tokens extracted from ai.croplifescience.com CSS */
export const AppColors = {
  // Primary greens (from --green, home-panel, auth-visual gradient)
  green:       '#3e7025',   // primary green — main brand colour
  greenDark:   '#3e7025',   // deep forest green (hero gradient start)
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
  title, subtitle, onBack, children, scroll = true, headerAvatar
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  scroll?: boolean;
  headerAvatar?: any;
}) {
  const header = (
    <View style={styles.header}>
      {headerAvatar && <Image source={headerAvatar} style={styles.headerAvatar} />}
      <View style={[styles.heading, headerAvatar && { alignItems: 'flex-start', marginLeft: 12 }]}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  const body = <View style={[styles.body, !scroll && { flex: 1, padding: 0 }]}>{children}</View>;
  return (
    <View style={styles.safe}>
      <GlobalHeader onBack={onBack} />
      {scroll
        ? <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {header}
            {body}
            <View style={{ height: 40 }} />
          </ScrollView>
        : <>{header}{body}</>}
    </View>
  );
}

/** Shared reusable styles — all matching the website's green design language */
export const shared = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.lineLight,
    padding: 16,
    shadowColor: AppColors.greenDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    color: AppColors.ink,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
  },
  body: {
    color: AppColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    color: AppColors.ink,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.line,
    backgroundColor: AppColors.bgAlt,
    paddingHorizontal: 14,
    fontSize: 15,
    color: AppColors.ink,
  },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: AppColors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: AppColors.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AppColors.pale,
  },
  chipText: {
    color: AppColors.green,
    fontWeight: '700',
    fontSize: 13,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  header: {
    minHeight: 54,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: AppColors.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpace: { width: 40 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, marginLeft: 4, backgroundColor: '#FFF' },
  heading: { flex: 1, alignItems: 'center' },
  title: { color: AppColors.ink, fontSize: 17, fontWeight: '800' },
  subtitle: { color: AppColors.muted, fontSize: 11, marginTop: 1 },
  scroll: { flexGrow: 1 },
  body: { padding: 16, gap: 12 },
});
