import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, Easing } from 'react-native-reanimated';

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
    <Animated.View
      style={[
        {
          position: 'absolute',
          top,
          left,
          width: size,
          height: size,
          backgroundColor: '#FFF',
          borderRadius: size / 2,
        },
        style,
      ]}
    />
  );
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedKeyButton = ({ num, onPress, isBackspace, children }: any) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));
  return (
    <AnimatedPressable
      onPressIn={() => scale.value = withSpring(0.85)}
      onPressOut={() => scale.value = withSpring(1)}
      onPress={onPress}
      style={[
        styles.keyButton,
        animatedStyle,
        isBackspace && { backgroundColor: 'transparent', borderWidth: 0 }
      ]}
    >
      {children ? children : <Text style={styles.keyText}>{num}</Text>}
    </AnimatedPressable>
  );
};

export const getBackendURL = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000`;
  }
  return process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:8000';
};

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [pin, setPin] = useState<string[]>([]);
  const [keypad, setKeypad] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shuffleKeypad = useCallback(() => {
    const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    setKeypad(nums);
  }, []);

  useEffect(() => {
    shuffleKeypad();
  }, [shuffleKeypad]);

  const handleBiometricAuth = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({ 
          promptMessage: 'Login to CodeAmigo' 
        });
        if (result.success) {
          router.replace('/scanner');
        }
      }
    } catch (e) {
      console.error("Error with biometric login", e);
    }
  };

  useEffect(() => {
    async function initLogin() {
      try {
        await SecureStore.deleteItemAsync('backend_url');
        const stored = await SecureStore.getItemAsync('saved_name');
        if (stored) {
          setName(stored);
        }
        await handleBiometricAuth();
      } catch (e) {
        console.error("Error loading biometric login", e);
      }
    }
    initLogin();
  }, [router]);

  const handleLogin = async (currentPin: string) => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const response = await fetch(`${getBackendURL()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          pin: currentPin
        })
      });

      const data = await response.json();
      if (response.ok) {
        await SecureStore.setItemAsync('saved_name', name);
        router.replace('/scanner');
      } else {
        const errorDetail = typeof data.detail === 'string' ? data.detail : (data.message || "Invalid PIN.");
        setErrorMsg(errorDetail);
        setPin([]);
        shuffleKeypad();
      }
    } catch (e) {
      setErrorMsg(`Cannot reach backend at ${getBackendURL()}.`);
      setPin([]);
      shuffleKeypad();
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (pin.length === 6) {
      handleLogin(pin.join(''));
    }
  }, [pin]);

  const handleKeyPress = (num: number) => {
    if (pin.length < 6 && !isSubmitting) {
      setPin(prev => [...prev, num.toString()]);
    }
  };

  const handleBackspace = () => {
    if (!isSubmitting) {
      setPin(prev => prev.slice(0, -1));
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
        {stars.map((star, i) => <Star key={i} {...star} />)}
      </View>
      <ScrollView 
        style={{ flex: 1, backgroundColor: 'transparent' }} 
        contentContainerStyle={{ 
          flexGrow: 1, 
          paddingTop: insets.top + 40,
          paddingBottom: 20 
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={[styles.sectionTitle, { fontSize: 24, textAlign: 'center', marginBottom: 20 }]}>
            Welcome Back{name ? `, ${name}` : ''}
          </Text>
          <Text style={{color: '#888', textAlign: 'center', marginBottom: 30}}>
            Enter your 6-digit secure PIN
          </Text>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <View style={styles.pinIndicatorContainer}>
            {[...Array(6)].map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.pinDot, 
                  pin.length > i ? styles.pinDotFilled : null
                ]} 
              />
            ))}
          </View>
          
          {isSubmitting && <ActivityIndicator style={{marginTop: 20}} size="small" color="#0A84FF" />}

          <TouchableOpacity onPress={handleBiometricAuth} style={styles.biometricButton}>
            <Ionicons name="finger-print" size={24} color="#0A84FF" />
            <Text style={styles.biometricText}>Login using Fingerprint</Text>
          </TouchableOpacity>

          <View style={styles.keypadContainer}>
            <View style={styles.keypadRow}>
              {keypad.slice(0, 3).map((num, idx) => (
                <AnimatedKeyButton key={idx} num={num} onPress={() => handleKeyPress(num)} />
              ))}
            </View>
            <View style={styles.keypadRow}>
              {keypad.slice(3, 6).map((num, idx) => (
                <AnimatedKeyButton key={idx} num={num} onPress={() => handleKeyPress(num)} />
              ))}
            </View>
            <View style={styles.keypadRow}>
              {keypad.slice(6, 9).map((num, idx) => (
                <AnimatedKeyButton key={idx} num={num} onPress={() => handleKeyPress(num)} />
              ))}
            </View>
            <View style={styles.keypadRow}>
              <View style={[styles.keyButton, { backgroundColor: 'transparent', borderWidth: 0 }]} />
              <AnimatedKeyButton num={keypad[9]} onPress={() => handleKeyPress(keypad[9])} />
              <AnimatedKeyButton isBackspace onPress={handleBackspace}>
                <Ionicons name="backspace-outline" size={28} color="#FFF" />
              </AnimatedKeyButton>
            </View>
          </View>

          <TouchableOpacity onPress={() => router.push('/signup')} style={{ marginTop: 40, alignItems: 'center' }}>
            <Text style={{ color: '#0A84FF', fontSize: 16 }}>Register a new device instead</Text>
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Text style={{ color: '#8B949E' }}>Created by Gineeth</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 4,
    paddingLeft: 4,
  },
  errorText: {
    color: '#FF453A',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  pinIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
  },
  pinDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
    borderWidth: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  pinDotFilled: {
    backgroundColor: '#4DA8DA',
    shadowColor: '#4DA8DA',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 5,
  },
  keypadContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  keyButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '500',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  biometricText: {
    color: '#0A84FF',
    fontSize: 16,
    fontWeight: '500',
  }
});
