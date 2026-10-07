import React, { useState, type ComponentProps } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, BackHandler, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import HomeScreen from '../screens/home/HomeScreen';
import InspectScreen from '../screens/inspect/InspectScreen';
import ProductsScreen from '../screens/products/ProductsScreen';
import RewardsScreen from '../screens/rewards/RewardsScreen';
import CalculatorScreen from '../screens/calculator/CalculatorScreen';
import WeatherScreen from '../screens/weather/WeatherScreen';
import AssistantScreen from '../screens/assistant/AssistantScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import DealerHomeScreen from '../screens/dealer/DealerHomeScreen';
import DealerRedeemScreen from '../screens/dealer/DealerRedeemScreen';
import DealerFarmersScreen from '../screens/dealer/DealerFarmersScreen';
import SalesOfficerHomeScreen from '../screens/sales_officer/SalesOfficerHomeScreen';
import SalesOfficerDealersScreen from '../screens/sales_officer/SalesOfficerDealersScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PRIMARY = '#3e7025';
const MUTED = '#94a096';

type Tab = 'home' | 'inspect' | 'products' | 'coupons' | 'rewards' | 'profile' | 'redeem' | 'farmers' | 'dealers';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

// ── Farmer tabs: Rewards replaces the old "Coupons" tab ─────────────────────
const FARMER_TABS: { id: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { id: 'home',    label: 'Home',    icon: 'home-outline',    activeIcon: 'home'    },
  { id: 'inspect', label: 'Inspect', icon: 'leaf-outline',    activeIcon: 'leaf'    },
  { id: 'products',label: 'Products',icon: 'grid-outline',    activeIcon: 'grid'    },
  { id: 'rewards', label: 'Rewards', icon: 'gift-outline',    activeIcon: 'gift'    },
  { id: 'profile', label: 'Profile', icon: 'person-outline',  activeIcon: 'person'  },
];

const GENERAL_USER_TABS: { id: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { id: 'home',    label: 'Home',    icon: 'home-outline',    activeIcon: 'home'    },
  { id: 'inspect', label: 'Inspect', icon: 'leaf-outline',    activeIcon: 'leaf'    },
  { id: 'products',label: 'Products',icon: 'grid-outline',    activeIcon: 'grid'    },
  { id: 'profile', label: 'Profile', icon: 'person-outline',  activeIcon: 'person'  },
];

// ── Dealer tabs ──────────────────────────────────────────────────────────────
const DEALER_TABS: { id: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { id: 'home',    label: 'Home',    icon: 'home-outline',    activeIcon: 'home'    },
  { id: 'products',label: 'Products',icon: 'grid-outline',    activeIcon: 'grid'    },
  { id: 'redeem',  label: 'Redeem',  icon: 'scan-outline',    activeIcon: 'scan'    },
  { id: 'farmers', label: 'Farmers', icon: 'people-outline',  activeIcon: 'people'  },
  { id: 'profile', label: 'Profile', icon: 'person-outline',  activeIcon: 'person'  },
];

// ── Sales Officer tabs: includes coupons tab ──────────────────────────────────
const SALES_OFFICER_TABS: { id: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { id: 'home',    label: 'Home',    icon: 'home-outline',    activeIcon: 'home'    },
  { id: 'inspect', label: 'Inspect', icon: 'leaf-outline',    activeIcon: 'leaf'    },
  { id: 'products',label: 'Products',icon: 'grid-outline',    activeIcon: 'grid'    },
  { id: 'farmers', label: 'Farmers', icon: 'people-outline',  activeIcon: 'people'  },
  { id: 'profile', label: 'Profile', icon: 'person-outline',  activeIcon: 'person'  },
];

function BottomTabBar({ active, onPress, role }: { active: Tab; onPress: (tab: Tab) => void; role: string | undefined }) {
  const insets = useSafeAreaInsets();
  const tabs = role === 'sales_officer' ? SALES_OFFICER_TABS : (role === 'dealer' ? DEALER_TABS : (role === 'farmer' ? FARMER_TABS : GENERAL_USER_TABS));
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity key={tab.id} style={styles.tabItem} onPress={() => onPress(tab.id)} activeOpacity={0.7}>
            <Ionicons name={isActive ? tab.activeIcon : tab.icon} size={24} color={isActive ? PRIMARY : MUTED} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            {isActive && <View style={styles.tabActiveBar} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AppContent() {
  const { isLoading, isLoggedIn, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [subScreen, setSubScreen] = useState<string | null>(null);
  // Track which inner tab the rewards/coupons page opens to
  const [rewardsInitialTab, setRewardsInitialTab] = useState<'coupons' | 'rewards'>('coupons');

  React.useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync().catch(() => {});
  }, [isLoading]);

  React.useEffect(() => {
    if (!isLoggedIn) { setActiveTab('home'); setSubScreen(null); }
  }, [isLoggedIn]);

  React.useEffect(() => {
    if (!isLoggedIn) return;
    const backAction = () => {
      if (subScreen) { setSubScreen(null); return true; }
      if (activeTab !== 'home') { setActiveTab('home'); return true; }
      Alert.alert('Hold on!', 'Are you sure you want to close this app?', [
        { text: 'Cancel', onPress: () => null, style: 'cancel' },
        { text: 'Sure', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [subScreen, activeTab, isLoggedIn]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!isLoggedIn) return <LoginScreen />;

  // Sub-screens
  if (subScreen === 'weather')     return <WeatherScreen onBack={() => setSubScreen(null)} />;
  if (subScreen === 'calculator')  return <CalculatorScreen onBack={() => setSubScreen(null)} />;
  if (subScreen === 'assistant')   return <AssistantScreen onBack={() => setSubScreen(null)} />;
  if (subScreen === 'history')     return <HistoryScreen onBack={() => setSubScreen(null)} />;

  const handleNavigate = (screen: string) => {
    // 'coupons' → open Rewards page at Coupons tab
    if (screen === 'coupons') {
      if (user?.role === 'farmer' || user?.role === 'general_user') {
        setRewardsInitialTab('coupons');
        setActiveTab('rewards');
      }
      return;
    }
    // 'farmers' → handle it for sales officer and dealer
    if (screen === 'farmers') {
      setActiveTab('farmers');
      return;
    }
    // 'rewards' → open Rewards page at Rewards tab
    if (screen === 'rewards') {
      setRewardsInitialTab('rewards');
      setActiveTab('rewards');
      return;
    }
    const tabIds: Tab[] = ['home', 'inspect', 'products', 'rewards', 'coupons', 'redeem', 'farmers', 'dealers', 'profile'];
    if (tabIds.includes(screen as Tab)) {
      setActiveTab(screen as Tab);
    } else {
      setSubScreen(screen);
    }
  };

  const goHome = () => { setActiveTab('home'); setSubScreen(null); };

  const renderScreen = () => {
    switch (activeTab) {
      case 'inspect':  return <InspectScreen onBack={goHome} />;
      case 'products': return <ProductsScreen onBack={goHome} />;
      case 'rewards':  return <RewardsScreen onBack={goHome} onNavigate={handleNavigate} initialTab={rewardsInitialTab} />;
      case 'coupons':
        // Sales officer coupon view (no rewards tab)
        return user?.role === 'sales_officer'
          ? <RewardsScreen onBack={goHome} onNavigate={handleNavigate} initialTab="coupons" />
          : <RewardsScreen onBack={goHome} onNavigate={handleNavigate} initialTab="coupons" />;
      case 'redeem':   return <DealerRedeemScreen onBack={goHome} />;
      case 'farmers':  return <DealerFarmersScreen onBack={goHome} />;
      case 'dealers':  return <SalesOfficerDealersScreen onBack={goHome} />;
      case 'profile':  return <ProfileScreen onNavigate={handleNavigate} />;
      default:
        if (user?.role === 'sales_officer') return <SalesOfficerHomeScreen onNavigate={handleNavigate} />;
        return user?.role === 'dealer'
          ? <DealerHomeScreen onNavigate={handleNavigate} />
          : <HomeScreen onNavigate={handleNavigate} />;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{renderScreen()}</View>
      <BottomTabBar
        active={activeTab}
        onPress={(tab) => {
          setSubScreen(null);
          // When farmer presses Rewards tab, keep the last initialTab or default coupons
          if (tab === 'rewards' && activeTab !== 'rewards') {
            setRewardsInitialTab('coupons');
          }
          setActiveTab(tab);
        }}
        role={user?.role}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f6ed' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#d7e4cf',
    paddingTop: 8,
    shadowColor: '#173b1b',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
    paddingVertical: 4,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', color: MUTED },
  tabLabelActive: { color: PRIMARY, fontWeight: '700' },
  tabActiveBar: { position: 'absolute', top: -8, width: 28, height: 3, borderRadius: 2, backgroundColor: '#cbe968' },
});
