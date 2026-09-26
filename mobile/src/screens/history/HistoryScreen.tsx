import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getMyInspections } from '../../services/api';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';

export default function HistoryScreen({ onBack }: { onBack: () => void }) {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<any[]>([]);

  useEffect(() => {
    if (!token || !user) {
      setLoading(false);
      return;
    }
    getMyInspections(token)
      .then(res => setInspections(res.inspections || []))
      .catch(() => setInspections([]))
      .finally(() => setLoading(false));
  }, [token, user]);

  return (
    <MobileScreen title="Crop History" subtitle="Your past field inspections" onBack={onBack}>
      {loading ? (
        <ActivityIndicator size="large" color={AppColors.green} style={{ marginTop: 40 }} />
      ) : inspections.length === 0 ? (
        <View style={[shared.card, { alignItems: 'center', paddingVertical: 40 }]}>
          <Ionicons name="leaf-outline" size={48} color={AppColors.mutedLight} />
          <Text style={[shared.sectionTitle, { marginTop: 16 }]}>No inspections yet</Text>
          <Text style={[shared.body, { textAlign: 'center', marginTop: 8 }]}>
            Use the Inspect tool to identify crop issues and they will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {inspections.map((insp: any) => {
            const isCompleted = insp.status === 'completed';
            const cropText = insp.farmer_crop_text || 'Unknown crop';
            const dateStr = insp.completed_at ? new Date(insp.completed_at).toLocaleDateString() : 'Pending';

            return (
              <View key={insp.id} style={styles.card}>
                <View style={styles.header}>
                  <View style={styles.headerTitleBox}>
                    <View style={[styles.iconBox, { backgroundColor: isCompleted ? AppColors.greenLight : '#F0F4F8' }]}>
                      <Ionicons name={isCompleted ? "checkmark-circle" : "time"} size={20} color={isCompleted ? AppColors.green : AppColors.muted} />
                    </View>
                    <View>
                      <Text style={styles.cropTitle}>{cropText}</Text>
                      <Text style={styles.date}>{dateStr} • {insp.photo_count} photo(s)</Text>
                    </View>
                  </View>
                </View>

                {isCompleted ? (
                  <View style={styles.resultBox}>
                    <Text style={styles.issueName}>{insp.issue_name || 'No issue detected'}</Text>
                    {insp.diagnosis_confidence && (
                      <Text style={styles.confidence}>Confidence: {Math.round(insp.diagnosis_confidence * 100)}%</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.resultBox}>
                    <Text style={[styles.issueName, { color: AppColors.muted }]}>Analysis incomplete or failed</Text>
                  </View>
                )}

                {insp.symptom_notes ? (
                  <Text style={styles.notes} numberOfLines={2}>Notes: {insp.symptom_notes}</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.lineLight,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: AppColors.ink,
  },
  date: {
    fontSize: 12,
    color: AppColors.muted,
    marginTop: 2,
  },
  resultBox: {
    backgroundColor: '#F7FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  issueName: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.ink,
  },
  confidence: {
    fontSize: 12,
    color: AppColors.blue,
    fontWeight: '600',
    marginTop: 4,
  },
  notes: {
    fontSize: 13,
    color: AppColors.textSub,
    marginTop: 12,
    fontStyle: 'italic',
  }
});
