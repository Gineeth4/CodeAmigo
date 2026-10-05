import React, { useState, useEffect, memo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  Platform, 
  ScrollView,
  Alert,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useAnimatedKeyboard } from 'react-native-reanimated';

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

const StarryBackground = memo(() => {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: -1, backgroundColor: '#09090B' }]}>
      {stars.map((star, index) => (
        <Star key={index} {...star} />
      ))}
    </View>
  );
});

const ROLES = ['Student', 'Developer', 'Tech Lead', 'DevOps & Cloud'];

export const getBackendURL = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000`;
  }
  return process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:8000';
};

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const keyboard = useAnimatedKeyboard();
  const animatedKeyboardStyle = useAnimatedStyle(() => {
    return {
      paddingBottom: keyboard.height.value, 
    };
  });

  const [name, setName] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [signupPin, setSignupPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [showNoAccountsModal, setShowNoAccountsModal] = useState(false);

  useEffect(() => {
    SecureStore.deleteItemAsync('backend_url').catch(console.error);
  }, []);

  const handleSignUp = async () => {
    setErrorMsg('');
    if (!name || !signupPin || !confirmPin) {
      setErrorMsg("Please fill all details.");
      return;
    }
    if (signupPin !== confirmPin) {
      setErrorMsg("PINs do not match.");
      return;
    }
    if (signupPin.length !== 6 || isNaN(Number(signupPin))) {
      setErrorMsg("PIN must be exactly 6 digits.");
      return;
    }

    const payload = {
      name: name,
      role: role,
      pin: signupPin
    };

    await handleAuthorizedSignup(payload);
  };

  const handleAuthorizedSignup = async (signupPayload: any) => {
    try {
      // 1. Check if accounts already exist on this device
      const response = await fetch(`${getBackendURL()}/auth/users`);
      const data = await response.json();
      const isFirstAccount = data.status === 'success' && data.users.length === 0;

      if (!isFirstAccount) {
        // 2. If accounts already exist, require authorization before adding a new account
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        let authorized = false;

        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Authorize New Account Creation',
            fallbackLabel: 'Use Admin PIN'
          });
          if (result.success) {
            authorized = true;
          }
        } else {
          // Fallback or explicit secondary password prompt check can be added here
          authorized = true; // Fallback if no biometrics
        }

        if (!authorized) {
          Alert.alert("Access Denied", "Biometric authorization failed. Cannot create a new account.");
          return;
        }
      }

      // 3. Proceed to execute signup
      await executeSignupRequest(signupPayload, isFirstAccount);
    } catch (e) {
      Alert.alert('Network Error', `Cannot reach backend at ${getBackendURL()}. Check laptop Wi-Fi and firewall.`);
    }
  };

  const executeSignupRequest = async (payload: any, isFirstAccount: boolean) => {
    try {
      const res = await fetch(`${getBackendURL()}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (res.ok && result.status === 'success') {
        await SecureStore.setItemAsync('is_device_registered', 'true');
        await SecureStore.setItemAsync('saved_name', payload.name);
        await SecureStore.setItemAsync('user_role', payload.role);
        await SecureStore.setItemAsync('session_token', result.session_token);
        
        if (isFirstAccount) {
          // Show QR Code Pairing Screen ONLY for the very first account on a fresh device
          router.replace({ pathname: '/scanner', params: { source: 'signup' } });
        } else {
          // Skip QR pairing for subsequent accounts and go straight to chat
          router.replace('/chat');
        }
      } else {
        Alert.alert("Signup Failed", result.detail || result.message || "Could not create account.");
      }
    } catch (e) {
      Alert.alert("Error", "Network connection failed.");
    }
  };

  const handleLoginNavigation = async () => {
    try {
      const response = await fetch(`${getBackendURL()}/auth/users`);
      const data = await response.json();
      
      if (data.status === 'success' && data.users.length > 0) {
        router.replace('/login'); 
      } else {
        // Block navigation and show custom modal
        setShowNoAccountsModal(true);
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not verify accounts with the backend.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090B' }} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <StarryBackground />
      <Animated.View style={[{ flex: 1 }, animatedKeyboardStyle]}>
        <ScrollView 
          style={{ flex: 1, backgroundColor: 'transparent' }} 
          contentContainerStyle={{ 
            flexGrow: 1, 
            justifyContent: 'center',
            paddingTop: insets.top + 40,
            paddingBottom: 20 
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={[styles.sectionTitle, { fontSize: 24, textAlign: 'center', marginBottom: 20 }]}>Register Device</Text>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <View style={styles.form}>
            <TextInput 
              style={[styles.input, focusedInput === 'name' && styles.inputFocused]} 
              placeholder="Name" 
              placeholderTextColor="#888"
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedInput('name')}
              onBlur={() => setFocusedInput(null)}
            />
            
            <Text style={styles.sectionTitle}>Professional Role</Text>
            <View style={styles.roleContainer}>
              <View style={styles.roleGrid}>
                {ROLES.map(r => (
                  <TouchableOpacity 
                    key={r} 
                    style={[styles.roleButton, role === r && styles.roleButtonActive]}
                    onPress={() => setRole(r)}
                  >
                    <Text style={[styles.roleButtonText, role === r && styles.roleButtonTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TextInput 
              style={[styles.input, focusedInput === 'signupPin' && styles.inputFocused]} 
              placeholder="6-digit PIN" 
              placeholderTextColor="#888"
              value={signupPin}
              onChangeText={setSignupPin}
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              onFocus={() => setFocusedInput('signupPin')}
              onBlur={() => setFocusedInput(null)}
            />
            <TextInput 
              style={[styles.input, focusedInput === 'confirmPin' && styles.inputFocused]} 
              placeholder="Confirm 6-digit PIN" 
              placeholderTextColor="#888"
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              onFocus={() => setFocusedInput('confirmPin')}
              onBlur={() => setFocusedInput(null)}
            />
            <TouchableOpacity style={styles.submitBtn} onPress={handleSignUp}>
              <Text style={styles.submitBtnText}>Complete Sign Up</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLoginNavigation} style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: '#0A84FF', fontSize: 16 }}>Already have an account? Log In</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Text style={{ color: '#8B949E' }}>Created by Gineeth</Text>
        </View>
      </ScrollView>
      </Animated.View>
      {/* Custom No Accounts Modal */}
      <Modal visible={showNoAccountsModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#1E1E20', padding: 24, borderRadius: 16, width: '80%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#EF4444', fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
              No Accounts Found
            </Text>
            <Text style={{ color: '#A1A1AA', textAlign: 'center', marginBottom: 24, fontSize: 16, lineHeight: 24 }}>
              There are no registered accounts on this device. Please complete the sign up process first.
            </Text>
            <TouchableOpacity 
              onPress={() => setShowNoAccountsModal(false)} 
              style={{ backgroundColor: '#0A84FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 16 }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 12,
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: '#4DA8DA',
    color: '#4DA8DA',
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 4,
    paddingLeft: 4,
  },
  roleContainer: {
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  roleButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  roleButtonActive: {
    borderColor: '#4DA8DA',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  roleButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
  },
  roleButtonTextActive: {
    color: '#4DA8DA',
  },
  submitBtn: {
    backgroundColor: '#0A84FF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#FF453A',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  }
});
