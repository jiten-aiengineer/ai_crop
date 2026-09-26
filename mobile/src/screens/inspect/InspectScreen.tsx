import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { inspectCrop, getCatalogue } from '../../services/api';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';

import { CROP_CATEGORIES, getCropCategory, transformCropList } from '../../utils/crop';

type Phase = 'capture' | 'analysing' | 'result';

export default function InspectScreen({ onBack }: { onBack: () => void }) {
  const { user, token } = useAuth();
  const sales = user?.role === 'sales_officer';
  const minimum = sales ? 4 : 1;

  const [allCrops, setAllCrops] = useState<string[]>(['Paddy', 'Cotton', 'Tomato', 'Chilli', 'Soybean', 'Wheat', 'Maize', 'Groundnut', 'Onion', 'Potato', 'Other']);
  const [crop, setCrop] = useState('');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  
  const [cropModal, setCropModal] = useState(false);
  const [camera, setCamera] = useState(false);
  
  React.useEffect(() => {
    getCatalogue().then(res => {
      if (res.crops && res.crops.length > 0) {
        setAllCrops(transformCropList(res.crops));
      }
    }).catch(() => {});
  }, []);
  
  const [phase, setPhase] = useState<Phase>('capture');
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  
  const cam = useRef<CameraView>(null);

  const openCamera = async () => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) return;
    }
    setCamera(true);
  };

  const take = async () => {
    const photo = await cam.current?.takePictureAsync({ quality: 0.72, skipProcessing: false });
    if (photo?.uri) {
      setPhotos(v => [...v, photo.uri]);
      setCamera(false);
    }
  };

  const analyse = async () => {
    if (!crop || photos.length < minimum || !token) return;
    setPhase('analysing');
    setError('');
    try {
      let latitude = user?.latitude;
      let longitude = user?.longitude;
      if (latitude == null || longitude == null) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') throw new Error('Allow location to analyse the crop.');
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
      }
      const data = await inspectCrop({ token, crop, notes, photos, latitude, longitude, language: user?.preferred_language });
      setResult(data);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to analyse these photos.');
      setPhase('capture');
    }
  };

  const [activeCategory, setActiveCategory] = useState('All');
  const TABS = ['All', 'Vegetables', 'Fruits', 'Cash Crops', 'Cereals & Pulses', 'Oilseeds & Spices', 'Flowers', 'Other'];

  const visibleCrops = React.useMemo(() => {
    let list = allCrops;
    if (activeCategory !== 'All') {
      list = list.filter(c => getCropCategory(c) === activeCategory);
    }
    if (query) {
      list = list.filter(c => c.toLowerCase().includes(query.toLowerCase()));
    }
    return list.sort((a, b) => a.localeCompare(b));
  }, [allCrops, activeCategory, query]);

  if (phase === 'result') {
    return (
      <MobileScreen title="Assessment" subtitle="Probable AI result" onBack={() => setPhase('capture')}>
        <View style={styles.resultHero}>
          <View style={styles.check}>
            <Ionicons name="checkmark" size={28} color="#FFF" />
          </View>
          <Text style={styles.resultTitle}>Assessment ready</Text>
          <Text style={styles.resultSub}>{crop} · {photos.length} image{photos.length === 1 ? '' : 's'} reviewed</Text>
        </View>
        <View style={shared.card}>
          <Text style={styles.eyebrow}>PROBABLE RESULT</Text>
          <Text style={shared.sectionTitle}>{String(result?.diagnosis_title || result?.condition_name || result?.diagnosis || 'Visible crop stress detected')}</Text>
          <Text style={[shared.body, { marginTop: 9 }]}>{String(result?.summary || result?.explanation || 'Review the visible signs and confirm the condition in the field before treatment.')}</Text>
          <View style={styles.confidence}>
            <Text style={styles.confidenceValue}>{Math.round(Number(result?.confidence || 0) * ((Number(result?.confidence || 0) <= 1) ? 100 : 1))}%</Text>
            <Text style={shared.body}>assessment confidence</Text>
          </View>
        </View>
        <View style={shared.card}>
          <Text style={shared.sectionTitle}>Recommended next step</Text>
          <Text style={[shared.body, { marginTop: 8 }]}>{String(result?.recommended_next_step || result?.next_step || 'Inspect nearby plants, check leaf undersides, and consult a crop expert before treatment.')}</Text>
        </View>
        <TouchableOpacity style={shared.primary} onPress={() => { setPhase('capture'); setPhotos([]); setCrop(''); setNotes(''); setResult(null); }}>
          <Ionicons name="camera" size={20} color="#FFF" />
          <Text style={shared.primaryText}>Start another inspection</Text>
        </TouchableOpacity>
      </MobileScreen>
    );
  }

  if (phase === 'analysing') {
    return (
      <MobileScreen title="Analysing crop" subtitle="Keep the app open" onBack={() => setPhase('capture')}>
        <View style={styles.processing}>
          <ActivityIndicator size="large" color={AppColors.blue} />
          <Text style={styles.processingTitle}>Reviewing field evidence</Text>
          <Text style={[shared.body, { textAlign: 'center' }]}>Checking the crop, visible symptoms, and matching catalogue categories.</Text>
          <View style={styles.progress}>
            <View style={styles.progressFill} />
          </View>
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen title="AI Crop Inspection" subtitle={sales ? '4 field photos required' : 'Add one or more clear photos'} onBack={onBack}>
      
      <View style={shared.card}>
        <Text style={shared.label}>Crop Details *</Text>
        <TouchableOpacity style={styles.dropdownSelector} onPress={() => setCropModal(true)}>
          <Text style={crop ? styles.dropdownSelected : styles.dropdownPlaceholder}>
            {crop || 'Select crop'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={AppColors.muted} />
        </TouchableOpacity>

        <TextInput
          style={[shared.input, { marginTop: 12, minHeight: 64, paddingTop: 14 }]}
          placeholder="What do you notice? (Optional notes)"
          placeholderTextColor={AppColors.mutedLight}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={20} color="#A52A2A" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={shared.card}>
        <View style={styles.row}>
          <View>
            <Text style={shared.sectionTitle}>Field photos</Text>
            <Text style={shared.body}>{sales ? `${photos.length}/4 required views` : `${photos.length} uploaded`}</Text>
          </View>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{photos.length}</Text>
          </View>
        </View>
        
        <View style={styles.photoGrid}>
          {photos.map((uri, i) => (
            <View key={uri} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <TouchableOpacity style={styles.remove} onPress={() => setPhotos(v => v.filter((_, n) => n !== i))}>
                <Ionicons name="close" size={15} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addPhoto} onPress={openCamera}>
            <Ionicons name="camera-outline" size={28} color={AppColors.blue} />
            <Text style={styles.addText}>Add photo</Text>
          </TouchableOpacity>
        </View>
        <Text style={[shared.body, { marginTop: 12 }]}>Use clear views of the whole plant, affected part, close-up symptom, and leaf underside when possible.</Text>
      </View>

      <TouchableOpacity disabled={!crop || photos.length < minimum} style={[shared.primary, (!crop || photos.length < minimum) && styles.disabled]} onPress={analyse}>
        <Ionicons name="sparkles" size={20} color="#FFF" />
        <Text style={shared.primaryText}>
          {!crop ? 'Select a crop' : photos.length < minimum ? `Add ${minimum - photos.length} more photo${minimum - photos.length === 1 ? '' : 's'}` : 'Analyse crop'}
        </Text>
      </TouchableOpacity>

      <Modal visible={cropModal} animationType="slide" transparent={true} onRequestClose={() => setCropModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select crop</Text>
              <TouchableOpacity onPress={() => setCropModal(false)}>
                <Ionicons name="close-circle" size={28} color={AppColors.mutedLight} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search crops..."
              placeholderTextColor={AppColors.mutedLight}
              value={query}
              onChangeText={setQuery}
            />
            <View style={{ height: 46, marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
                {TABS.map(tab => (
                  <TouchableOpacity 
                    key={tab} 
                    style={[styles.tabBtn, activeCategory === tab && styles.tabBtnActive]} 
                    onPress={() => setActiveCategory(tab)}
                  >
                    <Text style={[styles.tabText, activeCategory === tab && styles.tabTextActive]}>{tab}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {visibleCrops.map(x => (
                <TouchableOpacity 
                  key={x} 
                  style={[styles.modalItem, crop === x && styles.modalItemActive]}
                  onPress={() => {
                    setCrop(x);
                    setQuery('');
                    setCropModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, crop === x && styles.modalItemTextActive]}>{x}</Text>
                  {crop === x && <Ionicons name="checkmark" size={22} color={AppColors.green} />}
                </TouchableOpacity>
              ))}
              {visibleCrops.length === 0 && (
                 <Text style={styles.emptyText}>No crops found in this category. Try "All".</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={camera} animationType="slide" onRequestClose={() => setCamera(false)}>
        <View style={styles.cameraPage}>
          <CameraView ref={cam} style={StyleSheet.absoluteFill} />
          <View style={styles.cameraTop}>
            <TouchableOpacity onPress={() => setCamera(false)} style={styles.cameraRound}>
              <Ionicons name="close" size={26} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Capture crop photo</Text>
            <View style={{ width: 46 }} />
          </View>
          <View style={styles.cameraBottom}>
            <TouchableOpacity style={styles.shutter} onPress={take}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  dropdownSelector: {
    minHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: AppColors.line,
    backgroundColor: AppColors.bgAlt,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: AppColors.mutedLight,
  },
  dropdownSelected: {
    fontSize: 16,
    color: AppColors.ink,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: AppColors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.ink,
  },
  modalSearch: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: AppColors.bg,
    paddingHorizontal: 16,
    fontSize: 16,
    color: AppColors.ink,
    marginBottom: 16,
  },
  modalList: {
    maxHeight: 400,
  },
  tabsRow: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: AppColors.bg,
    borderWidth: 1,
    borderColor: AppColors.lineLight,
  },
  tabBtnActive: {
    backgroundColor: AppColors.green,
    borderColor: AppColors.green,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.muted,
  },
  tabTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.lineLight,
  },
  modalItemActive: {
    backgroundColor: AppColors.successBg,
    borderRadius: 12,
    borderBottomWidth: 0,
  },
  modalItemText: {
    fontSize: 16,
    color: AppColors.ink,
  },
  modalItemTextActive: {
    color: AppColors.green,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: AppColors.mutedLight,
    marginTop: 20,
    fontStyle: 'italic',
  },
  
  errorBox: { flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: '#FFF0EF', borderWidth: 1, borderColor: '#EAC1BE', borderRadius: 15, padding: 13 },
  errorText: { flex: 1, color: '#A52A2A', fontWeight: '700', lineHeight: 19 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { width: 42, height: 42, borderRadius: 14, backgroundColor: AppColors.pale, alignItems: 'center', justifyContent: 'center' },
  counterText: { color: AppColors.blue, fontWeight: '900', fontSize: 18 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 15 },
  photoWrap: { width: 82, height: 82 },
  photo: { width: '100%', height: '100%', borderRadius: 14 },
  remove: { position: 'absolute', right: -5, top: -5, width: 23, height: 23, borderRadius: 12, backgroundColor: '#B43636', alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 82, height: 82, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8FB0C6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F9FB' },
  addText: { fontSize: 11, color: AppColors.blue, fontWeight: '800', marginTop: 4 },
  disabled: { opacity: 0.42 },
  cameraPage: { flex: 1, backgroundColor: '#000' },
  cameraTop: { position: 'absolute', top: 45, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cameraRound: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  cameraTitle: { color: '#FFF', fontWeight: '900', fontSize: 17, textShadowColor: '#000', textShadowRadius: 5 },
  cameraBottom: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFF' },
  processing: { ...shared.card, alignItems: 'center', gap: 15, paddingVertical: 46 },
  processingTitle: { color: AppColors.ink, fontSize: 22, fontWeight: '900', marginTop: 8 },
  progress: { height: 8, width: '100%', borderRadius: 5, backgroundColor: '#DCE7ED', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', width: '72%', backgroundColor: AppColors.green, borderRadius: 5 },
  resultHero: { backgroundColor: AppColors.blue, borderRadius: 24, padding: 26, alignItems: 'center' },
  check: { width: 58, height: 58, borderRadius: 29, backgroundColor: AppColors.green, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: '#FFF', fontWeight: '900', fontSize: 23, marginTop: 12 },
  resultSub: { color: '#CFE2EF', marginTop: 5 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, color: AppColors.green, fontWeight: '900', marginBottom: 7 },
  confidence: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E5EDF2' },
  confidenceValue: { fontSize: 30, color: AppColors.blue, fontWeight: '900' }
});
