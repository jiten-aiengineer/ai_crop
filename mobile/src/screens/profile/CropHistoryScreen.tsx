import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';

export default function CropHistoryScreen({ onBack }: { onBack: () => void }) {
  // Mock history data for now
  const history = [
    { id: '1', date: 'Oct 12, 2026', crop: 'Tomato', issue: 'Early Blight', confidence: 92, action: 'Sprayed Meso Power 250ml' },
    { id: '2', date: 'Sep 28, 2026', crop: 'Cotton', issue: 'Healthy', confidence: 98, action: 'Routine check' },
    { id: '3', date: 'Aug 14, 2026', crop: 'Rice', issue: 'Stem Borer', confidence: 88, action: 'Recommended CLSL Zyme' },
  ];

  return (
    <MobileScreen title="Crop History" subtitle="Past inspections" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {history.map(item => (
          <View key={item.id} style={styles.card}>
            <View style={styles.header}>
              <View style={styles.dateBox}>
                <Ionicons name="calendar-outline" size={14} color={AppColors.muted} />
                <Text style={styles.date}>{item.date}</Text>
              </View>
              <View style={[styles.badge, item.issue === 'Healthy' ? styles.badgeGreen : styles.badgeRed]}>
                <Text style={[styles.badgeText, item.issue === 'Healthy' ? styles.badgeTextGreen : styles.badgeTextRed]}>
                  {item.issue}
                </Text>
              </View>
            </View>
            
            <View style={styles.body}>
              <Text style={styles.cropTitle}>{item.crop} Inspection</Text>
              <Text style={styles.confidence}>AI Confidence: {item.confidence}%</Text>
              
              <View style={styles.actionBox}>
                <Ionicons name="checkmark-circle-outline" size={16} color={AppColors.green} />
                <Text style={styles.actionText}>{item.action}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: AppColors.line, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F9FA', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: AppColors.lineLight },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { fontSize: 13, color: AppColors.muted, fontWeight: '600' },
  
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#E8F5E9' },
  badgeRed: { backgroundColor: '#FFEBEE' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeTextGreen: { color: '#2E7D32' },
  badgeTextRed: { color: '#C62828' },

  body: { padding: 16 },
  cropTitle: { fontSize: 18, fontWeight: '800', color: AppColors.ink },
  confidence: { fontSize: 13, color: AppColors.textSub, marginTop: 4 },

  actionBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: AppColors.greenLight, padding: 12, borderRadius: 10, marginTop: 16 },
  actionText: { color: AppColors.green, fontWeight: '700', fontSize: 13, flex: 1 }
});
