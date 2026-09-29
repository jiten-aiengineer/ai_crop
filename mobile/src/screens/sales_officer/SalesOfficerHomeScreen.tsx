import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MobileScreen, AppColors } from '../../components/MobileScreen';
import { useAuth } from '../../contexts/AuthContext';

export default function SalesOfficerHomeScreen({ onNavigate }: { onNavigate: (screen: any) => void }) {
  const { user } = useAuth();
  return (
    <MobileScreen title={`Hello, ${user?.name || 'Sales Officer'}`} subtitle="Sales Officer Dashboard">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome to your dashboard</Text>
          <Text style={styles.cardText}>Use the tabs below to manage farmers, dealers, and perform crop inspections.</Text>
        </View>
      </ScrollView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e0e0e0' },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#1c221e' },
  cardText: { fontSize: 14, color: '#5e6c62', lineHeight: 20 },
});
