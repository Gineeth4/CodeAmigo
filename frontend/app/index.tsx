import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  withRepeat,
  Easing
} from 'react-native-reanimated';

const STAR_COUNT = 50;
const stars = Array.from({ length: STAR_COUNT }).map(() => ({
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  size: Math.random() * 3 + 1,
  delay: Math.random() * 2000,
  duration: Math.random() * 2000 + 1500,
}));

const Star = ({ top, left, size, delay, duration }: any) => {
  const opacity = useSharedValue(0.1);
  useEffect(() => {
    setTimeout(() => {
      opacity.value = withRepeat(
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }, delay);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{
      position: 'absolute', top, left, width: size, height: size,
      backgroundColor: '#A3D9FF', borderRadius: size / 2,
      shadowColor: '#A3D9FF', shadowOpacity: 0.8, shadowRadius: 4,
    }, style]} />
  );
};

export default function WelcomeScreen() {
  const router = useRouter();
  const translateX = useSharedValue(0);

  const { width } = Dimensions.get('window');

  const handleUnlock = async () => {
    const isRegistered = await SecureStore.getItemAsync('is_device_registered');
    if (isRegistered === 'true') {
      router.replace('/login');
    } else {
      router.replace('/signup');
    }
  };

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationX <= 0) {
        translateX.value = event.translationX;
      }
    })
    .onEnd(() => {
      if (translateX.value < -150) {
        translateX.value = withTiming(-500, { duration: 300 }, () => {
          runOnJS(handleUnlock)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedPageStyle = useAnimatedStyle(() => {
    // 1. Normalize the swipe progress from 0 to 1
    const progress = Math.min(Math.max(-translateX.value / width, 0), 1);

    // 2. Parallax Shift: Move left, but slower than the finger for weight
    const shiftX = interpolate(progress, [0, 1], [0, -width * 0.8], Extrapolation.CLAMP);

    // 3. Spatial Tilt: Rotate slightly on the Y-axis to look away
    const rotateY = interpolate(progress, [0, 1], [0, -35], Extrapolation.CLAMP);

    // 4. Depth Push: Shrink the screen to push it into the background
    const scale = interpolate(progress, [0, 1], [1, 0.75], Extrapolation.CLAMP);

    // 5. Cinematic Dissolve: Fade out smoothly at the tail end of the swipe
    const opacity = interpolate(progress, [0, 0.6, 1], [1, 0.9, 0], Extrapolation.CLAMP);

    return {
      transform: [
        { perspective: 1500 }, // High perspective for a deep 3D space
        { translateX: shiftX },
        { scale: scale },
        { rotateY: `${rotateY}deg` }
      ],
      opacity,
      backgroundColor: '#09090B', // Keep dark to match the void
      zIndex: 1,
    };
  });

  const ghostLayerStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.max(-translateX.value / width, 0), 1);
    
    // The underlying screen swells up from 90% to 100% size
    const backgroundScale = interpolate(progress, [0, 1], [0.9, 1], Extrapolation.CLAMP);
    const backgroundOpacity = interpolate(progress, [0, 0.5, 1], [0, 0.5, 1], Extrapolation.CLAMP);

    return {
      transform: [{ scale: backgroundScale }],
      opacity: backgroundOpacity,
      ...StyleSheet.absoluteFill,
      zIndex: -1,
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateX.value, [0, -width], [0, 0.7]);
    return {
      opacity,
      backgroundColor: 'black',
      ...StyleSheet.absoluteFill,
    };
  });

  return (
    <GestureHandlerRootView style={styles.container}>
      <Animated.View style={[ghostLayerStyle, { backgroundColor: '#09090B', justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#8B949E', fontSize: 24, fontWeight: 'bold' }}>Authentication</Text>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[animatedPageStyle, styles.screen]}>
          {stars.map((star, i) => <Star key={i} {...star} />)}
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/CodeAmigoLogo.png')} 
              style={styles.logo}
              resizeMode="cover"
            />
            <Text style={styles.appName}>CodeAmigo</Text>
            <Text style={styles.tagline}>Your Friendly Neighbourhood Codeman</Text>
          </View>
          <View style={styles.footer}>
            <Text style={styles.instructionText}>
              ← Swipe left to unlock
            </Text>
          </View>
          <Animated.View pointerEvents="none" style={shadowStyle} />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 250,
    height: 250,
    borderRadius: 30,
  },
  appName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 24,
    letterSpacing: 1,
  },
  tagline: {
    color: '#8B949E',
    fontSize: 16,
    marginTop: 8,
  },
  footer: {
    paddingBottom: 60,
  },
  instructionText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  }
});
