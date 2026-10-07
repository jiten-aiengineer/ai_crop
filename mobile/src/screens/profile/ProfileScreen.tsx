import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, Modal, ScrollView, Linking, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import mascotImage from '../../../assets/images/mascot_v3.png';
import { logRewardActivity, updateProfile, updateLanguage } from '../../services/api';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { TextInput } from 'react-native';

const LANGUAGES = [
  // Indian Languages (English and Hindi must be at top)
  { code: 'en', label: 'English', group: 'Indian' },
  { code: 'hi', label: 'हिंदी (Hindi)', group: 'Indian' },
  { code: 'bn', label: 'বাংলা (Bengali)', group: 'Indian' },
  { code: 'te', label: 'తెలుగు (Telugu)', group: 'Indian' },
  { code: 'mr', label: 'मराठी (Marathi)', group: 'Indian' },
  { code: 'ta', label: 'தமிழ் (Tamil)', group: 'Indian' },
  { code: 'ur', label: 'اردو (Urdu)', group: 'Indian' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)', group: 'Indian' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', group: 'Indian' },
  { code: 'or', label: 'ଓଡ଼ିଆ (Odia)', group: 'Indian' },
  { code: 'ml', label: 'മലയാളം (Malayalam)', group: 'Indian' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)', group: 'Indian' },
  { code: 'as', label: 'অসমীয়া (Assamese)', group: 'Indian' },

  // Other Country Languages
  { code: 'es', label: 'Español (Spanish)', group: 'Other' },
  { code: 'fr', label: 'Français (French)', group: 'Other' },
  { code: 'ar', label: 'العربية (Arabic)', group: 'Other' },
  { code: 'ru', label: 'Русский (Russian)', group: 'Other' },
  { code: 'pt', label: 'Português (Portuguese)', group: 'Other' },
  { code: 'de', label: 'Deutsch (German)', group: 'Other' },
  { code: 'ja', label: '日本語 (Japanese)', group: 'Other' },
  { code: 'ko', label: '한국어 (Korean)', group: 'Other' },
  { code: 'zh', label: '中文 (Chinese)', group: 'Other' },
  { code: 'it', label: 'Italiano (Italian)', group: 'Other' },
  { code: 'tr', label: 'Türkçe (Turkish)', group: 'Other' },
];

export default function ProfileScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user, login, logout, token } = useAuth();
  const [showTerms, setShowTerms] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReferral, setUpgradeReferral] = useState('');
  const [upgradeTerms, setUpgradeTerms] = useState(false);
  const [upgradePromos, setUpgradePromos] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  
  const [permission, requestPermission] = useCameraPermissions();

  const filteredLanguages = LANGUAGES.filter(l => 
    l.label.toLowerCase().includes(langSearch.toLowerCase())
  );

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => logout() }
      ]
    );
  };

  const handleSocialPress = async (url: string) => {
    try {
      const key = `social_reward_${user?.mobile_number}`;
      const claimed = await AsyncStorage.getItem(key);
      if (!claimed && token) {
        // give 5 points once
        await logRewardActivity(token, 'social_follow');
        await AsyncStorage.setItem(key, 'true');
        Alert.alert('Reward Unlocked!', 'You received 5 reward points for following us!');
      }
      Linking.openURL(url);
    } catch (e) {
      Linking.openURL(url);
    }
  };

  const handleLanguageSelect = async (code: string) => {
    if (!token || !user) return;
    try {
      try {
        await updateLanguage(token, code);
      } catch (e) {
        const fullProfile = {
          role: user.role || 'general_user',
          first_name: user.first_name || 'Farmer',
          last_name: user.last_name || '',
          preferred_language: code,
          social_media_used: (user as any).social_media_used?.length ? (user as any).social_media_used : ['whatsapp'],
          acquisition_source: (user as any).acquisition_source || 'app',
          location_label: (user as any).location_label || 'Unknown',
          location_consent: true,
          location_latitude: (user as any).location_latitude || 22.0,
          location_longitude: (user as any).location_longitude || 77.0,
        };
        await updateProfile(token, fullProfile);
      }
    } catch (e) {
      console.warn('Backend update failed:', e);
    } finally {
      login(token, { ...user, preferred_language: code } as any);
      setShowLanguage(false);
    }
  };

  const handleUpgrade = async () => {
    if (!token || !user) return;
    setUpgradeLoading(true);
    try {
      const fullProfile = {
        role: 'farmer',
        referral_code: upgradeReferral.trim() ? upgradeReferral.trim() : undefined,
      };
      await updateProfile(token, fullProfile);
      login(token, { ...user, role: 'farmer' } as any);
      setShowUpgrade(false);
    } catch (e) {
      console.warn('Backend upgrade failed:', e);
    } finally {
      setUpgradeLoading(false);
    }
  };

  return (
    <MobileScreen title="My Profile" subtitle="Account and preferences">
      <View style={styles.identity}>
        <Image source={mascotImage} style={styles.avatar} />
        <Text style={styles.name}>{user?.first_name} {user?.last_name || ''}</Text>
        <Text style={styles.mobile}>{user?.mobile_number}</Text>
        <View style={styles.role}>
          <Text style={styles.roleText}>{(user?.role || 'general_user').replace('_', ' ')}</Text>
        </View>
      </View>
      
      <View style={shared.card}>
        <Text style={shared.sectionTitle}>Dashboard</Text>
        
        {user?.role === 'general_user' && (
          <TouchableOpacity onPress={() => setShowUpgrade(true)} style={[styles.row, { backgroundColor: AppColors.green + '11', borderRadius: 8, marginHorizontal: -8, paddingHorizontal: 8 }]}>
            <View style={styles.icon}>
              <Ionicons name="star" size={20} color={AppColors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: AppColors.green }]}>Upgrade to Farmer</Text>
              <Text style={[styles.rowValue, { color: AppColors.green }]}>Unlock coupons & rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={AppColors.green} />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => onNavigate?.('history')} style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.icon}>
            <Ionicons name="time-outline" size={20} color={AppColors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>History</Text>
            <Text style={styles.rowValue}>Past Crop Inspections</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>
      </View>

      <View style={shared.card}>
        <Text style={shared.sectionTitle}>Settings</Text>
        
        <TouchableOpacity onPress={() => setShowLanguage(true)} style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="language-outline" size={20} color={AppColors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Language</Text>
            <Text style={styles.rowValue}>{(user?.preferred_language || 'en').toUpperCase()}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowContact(true)} style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="call-outline" size={20} color={AppColors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Support</Text>
            <Text style={styles.rowValue}>Contact Us</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowTerms(true)} style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.icon}>
            <Ionicons name="document-text-outline" size={20} color={AppColors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Legal</Text>
            <Text style={styles.rowValue}>Terms & Conditions</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>
      </View>

      <View style={shared.card}>
        <Text style={shared.sectionTitle}>Follow Us</Text>
        <Text style={styles.rewardText}>Follow our social media channels to get 5 reward points!</Text>
        
        <View style={styles.socialContainer}>
          <TouchableOpacity onPress={() => handleSocialPress('https://www.facebook.com/CropLifeScienceLtd/')} style={styles.socialIcon} activeOpacity={0.7}>
            <Ionicons name="logo-facebook" size={24} color="#1877F2" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSocialPress('https://www.instagram.com/croplifesciencelimited/')} style={styles.socialIcon} activeOpacity={0.7}>
            <Ionicons name="logo-instagram" size={24} color="#E4405F" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSocialPress('https://in.linkedin.com/company/crop-life-science-limited')} style={styles.socialIcon} activeOpacity={0.7}>
            <Ionicons name="logo-linkedin" size={24} color="#0A66C2" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSocialPress('https://croplifescience.com/')} style={styles.socialIcon} activeOpacity={0.7}>
            <Ionicons name="globe-outline" size={24} color="#0F766E" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={21} color="#B3261E" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
      <Text style={styles.version}>CLSL AI · Crop care, made smarter</Text>

      {/* Upgrade Modal */}
      <Modal visible={showUpgrade} animationType="slide" transparent onRequestClose={() => setShowUpgrade(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: AppColors.ink, marginBottom: 8 }}>Upgrade to Farmer</Text>
            <Text style={{ fontSize: 13, color: AppColors.muted, marginBottom: 20 }}>
              Enter a referral code from a CLSL dealer or sales officer to unlock exclusive coupons, rewards, and dealer connectivity.
            </Text>
            
            <Text style={{ fontSize: 13, fontWeight: '700', color: AppColors.ink, marginBottom: 8 }}>Dealer / Sales Officer Referral Code (Optional)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: '#E8EEF2', borderRadius: 8, padding: 12, fontSize: 15 }}
                placeholder="e.g., FAR-1234"
                autoCapitalize="characters"
                value={upgradeReferral}
                onChangeText={setUpgradeReferral}
              />
              <TouchableOpacity
                style={{ backgroundColor: AppColors.green + '11', padding: 12, borderRadius: 8 }}
                onPress={async () => {
                  if (!permission?.granted) {
                    await requestPermission();
                  }
                  setShowScanner(true);
                }}
              >
                <Ionicons name="qr-code-outline" size={24} color={AppColors.green} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }} onPress={() => setUpgradeTerms(!upgradeTerms)}>
              <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: upgradeTerms ? AppColors.green : '#ccc', backgroundColor: upgradeTerms ? AppColors.green : '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                {upgradeTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={{ fontSize: 13, color: AppColors.ink, flex: 1 }}>I agree to the Terms and Conditions</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }} onPress={() => setUpgradePromos(!upgradePromos)}>
              <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: upgradePromos ? AppColors.green : '#ccc', backgroundColor: upgradePromos ? AppColors.green : '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                {upgradePromos && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={{ fontSize: 13, color: AppColors.ink, flex: 1 }}>I want to receive rewards and promotional messages</Text>
            </TouchableOpacity>
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowUpgrade(false)} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: AppColors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUpgrade}
                disabled={upgradeLoading || !upgradeTerms || !upgradePromos}
                style={{ backgroundColor: AppColors.green, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, opacity: (!upgradeTerms || !upgradePromos || upgradeLoading) ? 0.5 : 1 }}
              >
                {upgradeLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Upgrade Now</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Scan Referral QR</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close-circle" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
          {permission?.granted && showScanner ? (
            <View style={{ flex: 1, overflow: 'hidden', borderRadius: 20, margin: 20 }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(result) => {
                  setUpgradeReferral(result.data);
                  setShowScanner(false);
                }}
              />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: AppColors.green, margin: 40, borderRadius: 12 }} pointerEvents="none" />
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff' }}>Camera permission is required.</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Terms Modal */}
      <Modal visible={showTerms} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTerms(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Terms & Conditions</Text>
            <TouchableOpacity onPress={() => setShowTerms(false)}>
              <Ionicons name="close-circle" size={32} color={AppColors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.termsContent}>
            <Text style={styles.termsBody}>
              Welcome to Crop Life Science Limited (CLSL) AI App. By using this application, you agree to the following terms:{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>1. Usage:</Text> This application is provided for informational purposes only. The crop disease predictions, weather advisory, and spray calculations are algorithmic estimates and should not replace professional agricultural consultation.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>2. Privacy & Data:</Text> We value your privacy. We collect basic profile data (name, mobile) and approximate location to provide localized weather and nearest dealer mapping. We do not sell your personal data to third parties.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>3. Promotions:</Text> Farmers who opt-in may receive SMS or WhatsApp notifications containing rewards, promotional offers, and localized weather alerts. You can opt-out by contacting our support hotline.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>4. Liability:</Text> CLSL is not liable for any crop damage, financial loss, or incorrect product application resulting from the use of the tools in this app. Always read the printed label on the physical product before application.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>5. Rewards:</Text> Coupon codes are subject to verification by the local dealer. CLSL reserves the right to withdraw or modify promotional campaigns without prior notice.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>6. Artificial Intelligence:</Text> The AI crop inspection uses image recognition and may occasionally misidentify diseases. Always consult an agronomist for severe crop issues.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>7. Coupons Expiry:</Text> Coupons and reward points have validity periods and may expire if unused.{'\n\n'}
              <Text style={{ fontWeight: 'bold' }}>8. Account Suspension:</Text> CLSL reserves the right to suspend accounts found abusing the reward system.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Contact Modal */}
      <Modal visible={showContact} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowContact(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Contact Us</Text>
            <TouchableOpacity onPress={() => setShowContact(false)}>
              <Ionicons name="close-circle" size={32} color={AppColors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.termsContent}>
            
            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>Head Office</Text>
              <Text style={styles.termsBody}>6th Floor, ABS Tower, Old Padra Road, Vadodara-390007 (Gujarat) India</Text>
              <Text style={styles.contactHighlight}>+91 8866330151</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:info@croplifescience.com')}>
                <Text style={styles.link}>info@croplifescience.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>Manufacturing Plant</Text>
              <Text style={styles.termsBody}>Plot No. 5151, 5165 and 5166, G.I.D.C. Estate, Ankleshwar, Dist: Bharuch – 393002, Gujarat, India.</Text>
              <Text style={styles.contactHighlight}>+91 9328074288</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://maps.app.goo.gl/vdLHhCFm7MM4MHoG9')}>
                <Text style={styles.link}>View on google map</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>Marketing Office</Text>
              <Text style={styles.termsBody}>6th Floor, ABS Tower, Old Padra Road, Vadodara-390007 (Gujarat) India</Text>
              <Text style={styles.contactHighlight}>+91 8866330151</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://maps.app.goo.gl/tnTRLkkxAeQJCJEBA')}>
                <Text style={styles.link}>View on google map</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>Brand Product and Distributorship Inquiry</Text>
              <Text style={styles.termsBody}>Mr. Sunil Virolia</Text>
              <Text style={styles.contactHighlight}>+91 98247 03012</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:sunil@croplifescience.com')}>
                <Text style={styles.link}>sunil@croplifescience.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>International Business Inquiry /Export</Text>
              <Text style={styles.termsBody}>Mr. Rakesh Rattan</Text>
              <Text style={styles.contactHighlight}>+91 95120 12106</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:rakesh.ratan@croplifescience.com')}>
                <Text style={styles.link}>rakesh.ratan@croplifescience.com</Text>
              </TouchableOpacity>
              <Text style={[styles.termsBody, { marginTop: 8 }]}>Mr. Mihir Shah</Text>
              <Text style={styles.contactHighlight}>+91 63582 37187</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:mihir.shah@croplifescience.com')}>
                <Text style={styles.link}>mihir.shah@croplifescience.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>Institutional/Bulk Business Inquiry</Text>
              <Text style={styles.termsBody}>Mr. Kaushal Shah</Text>
              <Text style={styles.contactHighlight}>+91 90999 08323</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:kaushal@croplifescience.com')}>
                <Text style={styles.link}>kaushal@croplifescience.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>Purchase/Procurement Inquiry</Text>
              <Text style={styles.termsBody}>Including packaging bottles, Auxiliary chemicals{'\n'}Mr. Kaushal Shah</Text>
              <Text style={styles.contactHighlight}>+91 90999 08323</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:kaushal@croplifescience.com')}>
                <Text style={styles.link}>kaushal@croplifescience.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>B2B Sales/ Global Head – Corporate Business</Text>
              <Text style={styles.termsBody}>Mr. Himanshu Divetia</Text>
              <Text style={styles.contactHighlight}>+91 98245 05227</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:himanshu.divetia@croplifescience.com')}>
                <Text style={styles.link}>himanshu.divetia@croplifescience.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contactBlock}>
              <Text style={styles.contactTitle}>For Brand Sales and Customer Support</Text>
              <Text style={styles.termsBody}>Mr. Nitesh Shelar</Text>
              <Text style={styles.contactHighlight}>+91 99099 14172</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:niteshs@croplifescience.com')}>
                <Text style={styles.link}>niteshs@croplifescience.com</Text>
              </TouchableOpacity>
              <Text style={[styles.termsBody, { marginTop: 8 }]}>Mr. R.K. Pandey</Text>
              <Text style={styles.contactHighlight}>+91 63582 47141</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:sales.head@croplifescience.com')}>
                <Text style={styles.link}>sales.head@croplifescience.com</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Language Modal */}
      <Modal visible={showLanguage} animationType="fade" transparent onRequestClose={() => setShowLanguage(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', width: '100%', maxHeight: '80%', borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: AppColors.ink }}>Select Language</Text>
              <TouchableOpacity onPress={() => setShowLanguage(false)}>
                <Ionicons name="close" size={24} color={AppColors.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10 }}>
                <Ionicons name="search" size={20} color={AppColors.muted} />
                <TextInput
                  placeholder="Search language..."
                  style={{ flex: 1, padding: 10, fontSize: 15, color: AppColors.ink }}
                  value={langSearch}
                  onChangeText={setLangSearch}
                />
              </View>
            </View>
            <ScrollView style={{ padding: 10 }}>
              {['Indian', 'Other'].map(group => {
                const groupLangs = filteredLanguages.filter(l => l.group === group);
                if (groupLangs.length === 0) return null;
                return (
                  <View key={group} style={{ marginBottom: 15 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: AppColors.muted, paddingHorizontal: 5, marginBottom: 8 }}>
                      {group === 'Indian' ? 'Indian Languages' : 'Other Languages'}
                    </Text>
                    {groupLangs.map(lang => (
                      <TouchableOpacity
                        key={lang.code}
                        onPress={() => handleLanguageSelect(lang.code)}
                        style={{ padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, backgroundColor: user?.preferred_language === lang.code ? '#F2F9F4' : '#FFF' }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: user?.preferred_language === lang.code ? '700' : '500', color: user?.preferred_language === lang.code ? AppColors.green : AppColors.ink }}>
                          {lang.label}
                        </Text>
                        {user?.preferred_language === lang.code && (
                          <Ionicons name="checkmark-circle" size={20} color={AppColors.green} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
              {filteredLanguages.length === 0 && (
                <Text style={{ textAlign: 'center', padding: 20, color: AppColors.muted }}>No languages found.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  identity: { ...shared.card, alignItems: 'center', paddingVertical: 25 },
  avatar: { width: 82, height: 82, borderRadius: 25 },
  name: { fontSize: 23, fontWeight: '900', color: AppColors.ink, marginTop: 12 },
  mobile: { color: AppColors.muted, marginTop: 3 },
  role: { backgroundColor: AppColors.pale, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6, marginTop: 12 },
  roleText: { color: AppColors.blue, fontWeight: '800', textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8EEF2' },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: AppColors.pale, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 12, color: AppColors.muted },
  rowValue: { fontSize: 15, color: AppColors.ink, fontWeight: '800', marginTop: 2 },
  logout: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#F0C9C6', backgroundColor: '#FFF5F4', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#B3261E', fontWeight: '900', fontSize: 16 },
  version: { textAlign: 'center', color: '#8294A0', fontSize: 12, marginTop: 4 },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: AppColors.lineLight },
  modalTitle: { fontSize: 20, fontWeight: '900', color: AppColors.ink },
  termsContent: { padding: 20 },
  termsBody: { fontSize: 14, lineHeight: 24, color: AppColors.muted },
  rewardText: { fontSize: 12, color: AppColors.muted, marginBottom: 12, marginTop: 4 },
  socialContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  socialIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: AppColors.bgAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.lineLight },

  contactBlock: { marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: AppColors.lineLight },
  contactTitle: { fontSize: 16, fontWeight: '800', color: AppColors.ink, marginBottom: 8 },
  contactHighlight: { fontSize: 15, fontWeight: '700', color: AppColors.green, marginTop: 4 },
  link: { color: '#0A66C2', fontWeight: '600', marginTop: 2 }
});
