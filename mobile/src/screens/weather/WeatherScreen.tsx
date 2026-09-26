import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';

export default function WeatherScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const place = user?.district || user?.city || 'Your district';
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
        const geo = await geoRes.json();
        if (!geo.results?.length) {
          setError('Location not found.');
          return;
        }
        const { latitude, longitude } = geo.results[0];

        // Fetch basic current and hourly metrics useful for agriculture
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover&hourly=precipitation_probability,wind_speed_10m,temperature_2m&forecast_hours=12&timezone=auto`);
        const w = await wRes.json();
        setWeather(w);
      } catch (e) {
        setError('Failed to load weather.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [place]);

  if (loading) {
    return <MobileScreen title="Field Weather" subtitle={place} onBack={onBack}>
      <ActivityIndicator size="large" color={AppColors.green} style={{marginTop:40}} />
    </MobileScreen>;
  }

  if (error || !weather) {
    return <MobileScreen title="Field Weather" subtitle={place} onBack={onBack}>
      <Text style={[shared.body, { textAlign: 'center', marginTop: 40 }]}>{error}</Text>
    </MobileScreen>;
  }

  const current = weather.current;
  const hourly = weather.hourly;
  const maxRainProb = Math.max(...hourly.precipitation_probability.slice(0, 4));
  const maxWind = Math.max(...hourly.wind_speed_10m.slice(0, 4));

  // Determine Spraying Status
  let sprayStatus = 'Good';
  let sprayColor = AppColors.green;
  let sprayMsg = 'Conditions look reasonable for spraying. Follow the product label.';
  if (maxRainProb > 40) {
    sprayStatus = 'Avoid now';
    sprayColor = AppColors.error;
    sprayMsg = 'High chance of rain in the next 4 hours. Spraying now may lead to product wash-off.';
  } else if (maxWind > 15) {
    sprayStatus = 'Caution';
    sprayColor = '#B9770E';
    sprayMsg = `Wind can cause spray drift. Adjust nozzle or wait for wind to die down.`;
  } else if (current.temperature_2m > 35) {
    sprayStatus = 'Caution';
    sprayColor = '#B9770E';
    sprayMsg = 'High temperatures can cause rapid evaporation. Spray during cooler hours.';
  }

  // Determine Irrigation Status
  let irrigationStatus = 'Good';
  let irrigationColor = AppColors.green;
  let irrigationMsg = 'Normal field work is suitable; keep monitoring conditions.';
  if (maxRainProb > 60) {
    irrigationStatus = 'Avoid now';
    irrigationColor = AppColors.error;
    irrigationMsg = 'Natural rain expected. Delay irrigation to prevent waterlogging.';
  }

  // Determine Field Work Status
  let fieldStatus = 'Good';
  let fieldColor = AppColors.green;
  let fieldMsg = 'Normal field work is suitable; keep monitoring conditions.';
  if (maxRainProb > 70 || maxWind > 30) {
    fieldStatus = 'Caution';
    fieldColor = '#B9770E';
    fieldMsg = 'Heavy weather expected. Prioritize safety during field work.';
  }

  return (
    <MobileScreen title="Field Weather" subtitle={place} onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Main Status */}
        <View style={styles.mainBox}>
          <Text style={styles.placeText}>{place}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <View>
              <Text style={styles.temp}>{Math.round(current.temperature_2m)}°</Text>
              <Text style={styles.cond}>Current conditions</Text>
            </View>
            <Ionicons name={current.cloud_cover > 50 ? "cloud" : "partly-sunny"} size={84} color="#FAD7A1" />
          </View>
        </View>

        {/* Quick Grid */}
        <View style={styles.grid}>
          <View style={styles.cell}>
            <Ionicons name="water" size={18} color="#2874A6" />
            <Text style={styles.cellVal}>{Math.round(current.relative_humidity_2m)}%</Text>
            <Text style={styles.cellLabel}>Humidity</Text>
          </View>
          <View style={styles.cell}>
            <Ionicons name="speedometer" size={18} color="#1E8449" />
            <Text style={styles.cellVal}>{Math.round(current.wind_speed_10m)} km/h</Text>
            <Text style={styles.cellLabel}>Wind</Text>
          </View>
          <View style={styles.cell}>
            <Ionicons name="rainy" size={18} color="#1E8449" />
            <Text style={styles.cellVal}>{maxRainProb}%</Text>
            <Text style={styles.cellLabel}>Rain chance</Text>
          </View>
          <View style={styles.cell}>
            <Ionicons name="sunny" size={18} color="#B9770E" />
            <Text style={styles.cellVal}>Next 6h</Text>
            <Text style={styles.cellLabel}>Forecast</Text>
          </View>
        </View>

        {/* Field Recommendations */}
        <View style={shared.card}>
          <Text style={shared.sectionTitle}>Field Recommendations</Text>
          <View style={styles.recList}>
            <RecRow 
              icon="water-outline" 
              label="Spraying" 
              status={sprayStatus} 
              statusColor={sprayColor} 
              desc={sprayMsg} 
            />
            <RecRow 
              icon="leaf-outline" 
              label="Irrigation" 
              status={irrigationStatus} 
              statusColor={irrigationColor} 
              desc={irrigationMsg} 
            />
            <RecRow 
              icon="hammer-outline" 
              label="Field work" 
              status={fieldStatus} 
              statusColor={fieldColor} 
              desc={fieldMsg} 
              isLast 
            />
          </View>
        </View>

        {/* Hourly Trend */}
        <View style={shared.card}>
          <Text style={shared.sectionTitle}>Next 12 hours</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
            {hourly.time.map((t: string, i: number) => {
              const date = new Date(t);
              const hour = date.getHours();
              const ampm = hour >= 12 ? 'PM' : 'AM';
              const h = hour % 12 || 12;
              return (
                <View key={t} style={styles.hourCol}>
                  <Text style={styles.hourLabel}>{h} {ampm}</Text>
                  <Ionicons name={hourly.precipitation_probability[i] > 30 ? 'rainy' : 'cloud'} size={24} color={AppColors.blue} />
                  <Text style={styles.hourTemp}>{Math.round(hourly.temperature_2m[i])}°</Text>
                  <Text style={styles.hourRain}>{hourly.precipitation_probability[i]}%</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

      </ScrollView>
    </MobileScreen>
  );
}

function RecRow({ icon, label, status, statusColor, desc, isLast }: { icon: any, label: string, status: string, statusColor: string, desc: string, isLast?: boolean }) {
  return (
    <View style={[styles.recRow, !isLast && styles.recBorder]}>
      <View style={styles.recHeader}>
        <View style={styles.recTitleBox}>
          <Ionicons name={icon} size={20} color="#486581" />
          <Text style={styles.recLabel}>{label}</Text>
        </View>
        <View style={styles.recStatusBox}>
          <Ionicons name={status === 'Good' ? "checkmark-circle" : (status === 'Caution' ? "warning" : "close-circle")} size={16} color={statusColor} />
          <Text style={[styles.recStatus, { color: statusColor }]}>{status}</Text>
        </View>
      </View>
      <Text style={styles.recDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mainBox: { backgroundColor: '#1C402B', borderRadius: 24, padding: 24, marginBottom: 16 },
  placeText: { color: '#C1F0C1', fontWeight: '800', fontSize: 15 },
  temp: { fontSize: 64, color: '#FFF', fontWeight: '300', letterSpacing: -2, includeFontPadding: false },
  cond: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  cell: { flex: 1, minWidth: '45%', backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: AppColors.line },
  cellVal: { fontSize: 20, fontWeight: '900', color: AppColors.ink, marginTop: 8 },
  cellLabel: { fontSize: 12, color: AppColors.muted, marginTop: 4 },

  recList: { marginTop: 12 },
  recRow: { paddingVertical: 16 },
  recBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  recHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recTitleBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recLabel: { fontSize: 16, fontWeight: '800', color: '#102A43' },
  recStatusBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recStatus: { fontSize: 14, fontWeight: '800' },
  recDesc: { fontSize: 13, color: '#486581', marginTop: 8, lineHeight: 18 },
  
  hourCol: { alignItems: 'center', marginRight: 24, gap: 8 },
  hourLabel: { fontSize: 12, color: AppColors.muted, fontWeight: '600' },
  hourTemp: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  hourRain: { fontSize: 11, color: AppColors.blue, fontWeight: '700' }
});
