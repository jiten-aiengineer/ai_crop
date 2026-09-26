import React, { useState, type ComponentProps } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import HomeScreen from '../screens/home/HomeScreen';
import InspectScreen from '../screens/inspect/InspectScreen';
import ProductsScreen from '../screens/products/ProductsScreen';
import CouponsScreen from '../screens/coupons/CouponsScreen';
import CalculatorScreen from '../screens/calculator/CalculatorScreen';
import WeatherScreen from '../screens/weather/WeatherScreen';
import AssistantScreen from '../screens/assistant/AssistantScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import DealerHomeScreen from '../screens/dealer/DealerHomeScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PRIMARY = '#3e7025';   // green — matches website's --green variable
const MUTED = '#94a096';     // muted green-grey — matches website's muted text

type Tab = 'home' | 'inspect' | 'products' | 'coupons' | 'profile';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const TABS: { id: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { id: 'inspect', label: 'Inspect', icon: 'leaf-outline', activeIcon: 'leaf' },
  { id: 'products', label: 'Products', icon: 'grid-outline', activeIcon: 'grid' },
  { id: 'coupons', label: 'Rewards', icon: 'gift-outline', activeIcon: 'gift' },
  { id: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

function BottomTabBar({ active, onPress }: { active: Tab; onPress: (tab: Tab) => void }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map(tab => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            onPress={() => onPress(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive ? tab.activeIcon : tab.icon}
              size={24}
              color={isActive ? PRIMARY : MUTED}
            />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
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

  React.useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  // Handle sub-screens launched from Home quick actions
  if (subScreen === 'weather') return <WeatherScreen onBack={() => setSubScreen(null)} />;
  if (subScreen === 'calculator') return <CalculatorScreen onBack={() => setSubScreen(null)} />;
  if (subScreen === 'assistant') return <AssistantScreen onBack={() => setSubScreen(null)} />;
  if (subScreen === 'history') return <HistoryScreen onBack={() => setSubScreen(null)} />;

  const handleNavigate = (screen: string) => {
    // Map quick-action IDs to tab IDs or sub-screens
    if (screen === 'home' || screen === 'inspect' || screen === 'products' || screen === 'coupons') {
      setActiveTab(screen as Tab);
    } else {
      setSubScreen(screen);
    }
  };

  const goHome = () => { setActiveTab('home'); setSubScreen(null); };

  const renderScreen = () => {
    switch (activeTab) {
      case 'inspect': return <InspectScreen onBack={goHome} />;
      case 'products': return <ProductsScreen onBack={goHome} />;
      case 'coupons': return <CouponsScreen onBack={goHome} />;
      case 'profile': return (
        <ProfileScreen onNavigate={handleNavigate} />
      );
      default: return user?.role === 'dealer' ? <DealerHomeScreen onNavigate={handleNavigate} /> : <HomeScreen onNavigate={handleNavigate} />;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {renderScreen()}
      </View>
      <BottomTabBar active={activeTab} onPress={(tab) => { setSubScreen(null); setActiveTab(tab); }} />
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
    borderTopColor: '#d7e4cf',   // green-tinted border like website
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    shadowColor: '#173b1b',       // deep green shadow
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
  // Active indicator bar — lime accent (matches website's --lime / active states)
  tabActiveBar: { position: 'absolute', top: -8, width: 28, height: 3, borderRadius: 2, backgroundColor: '#cbe968' },

});
