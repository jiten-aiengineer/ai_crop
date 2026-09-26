import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width } = Dimensions.get('window');

export default function FarmerAnimation() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(progress, {
        toValue: 100,
        duration: 12000, // 12 seconds per cycle
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [progress]);

  // ── Interpolations based on progress (0 to 100) ──

  // 1. Plants
  const seedlingOpacity = progress.interpolate({
    inputRange: [0, 5, 10, 35, 40, 100],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
  const plantOpacity = progress.interpolate({
    inputRange: [0, 35, 40, 65, 70, 100],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
  const fruitOpacity = progress.interpolate({
    inputRange: [0, 65, 70, 90, 95, 100],
    outputRange: [0, 0, 1, 1, 0, 0],
  });

  // 2. Farmer Movement (X axis)
  const farmerX = progress.interpolate({
    inputRange: [
      0, 
      10, 15, 30, 35, // Spray 1
      45, 50, 60, 65, // Spray 2
      75, 80, 90, 95  // Pick
    ],
    outputRange: [
      width + 100, 
      width + 100, 0, 0, width + 100,
      width + 100, 0, 0, width + 100,
      width + 100, 0, 0, width + 100
    ],
  });

  // 3. Spray Effect (Opacity)
  const sprayOpacity = progress.interpolate({
    inputRange: [0, 15, 17, 28, 30, 50, 52, 58, 60, 100],
    outputRange: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
  });

  // 4. Basket (Opacity)
  const basketOpacity = progress.interpolate({
    inputRange: [0, 75, 80, 100],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={styles.container}>
      {/* Sky */}
      <Text style={styles.sun}>☀️</Text>
      
      {/* Soil */}
      <View style={styles.soil} />

      {/* The Plant lifecycle (all in center) */}
      <View style={styles.plantContainer}>
        <Animated.Text style={[styles.emojiBig, { opacity: seedlingOpacity, position: 'absolute' }]}>🌱</Animated.Text>
        <Animated.Text style={[styles.emojiBig, { opacity: plantOpacity, position: 'absolute' }]}>🌿</Animated.Text>
        <Animated.Text style={[styles.emojiBig, { opacity: fruitOpacity, position: 'absolute' }]}>🍅</Animated.Text>
      </View>

      {/* The Farmer */}
      <Animated.View style={[styles.farmerContainer, { transform: [{ translateX: farmerX }] }]}>
        
        {/* Spray Effect (Only visible during spray times) */}
        <Animated.View style={[styles.sprayContainer, { opacity: sprayOpacity }]}>
          <Text style={styles.sprayText}>💦</Text>
        </Animated.View>

        {/* Farmer Emoji */}
        <Text style={styles.emojiGiant}>🧑‍🌾</Text>

        {/* Basket (Only visible during harvest) */}
        <Animated.View style={[styles.basketContainer, { opacity: basketOpacity }]}>
          <Text style={styles.emojiMedium}>🧺</Text>
        </Animated.View>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 140,
    backgroundColor: '#E0F7FA', // Light blue sky
    overflow: 'hidden',
    position: 'relative',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  sun: {
    position: 'absolute',
    top: 10,
    right: 20,
    fontSize: 30,
  },
  soil: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: '#8D6E63', // Brown soil
    borderTopWidth: 4,
    borderTopColor: '#5D4037',
  },
  plantContainer: {
    position: 'absolute',
    bottom: 15,
    left: width / 2 - 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiBig: {
    fontSize: 40,
  },
  farmerContainer: {
    position: 'absolute',
    bottom: 25,
    left: width / 2 + 10, // Farmer stands just to the right of the plant
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiGiant: {
    fontSize: 55,
  },
  emojiMedium: {
    fontSize: 30,
  },
  sprayContainer: {
    position: 'absolute',
    left: -35,
    top: 10,
    transform: [{ rotate: '-20deg' }],
  },
  sprayText: {
    fontSize: 30,
    color: '#00BFFF',
  },
  basketContainer: {
    position: 'absolute',
    left: -20,
    bottom: -10,
  }
});
