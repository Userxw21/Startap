import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';

/**
 * One shared param list for the single Stack.Navigator below, even though
 * Home and the signed-out screens (Login/ForgotPassword/ResetPassword)
 * never render together — RootNavigator swaps which ones are registered
 * based on auth status, but React Navigation still wants one type covering
 * whatever's mounted. Named "AuthStackParamList" (not "RootStackParamList")
 * since it's imported by ForgotPasswordScreen/ResetPasswordScreen for their
 * own route typing, and those only ever exist in the signed-out state.
 */
export type AuthStackParamList = {
  Home: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { phone: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'signedIn' ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
