import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { I18nProvider } from './src/i18n/I18nProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </I18nProvider>
  );
}
