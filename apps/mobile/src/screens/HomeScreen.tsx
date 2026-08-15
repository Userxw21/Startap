import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Courier } from '@courier/shared-types';
import { useTranslation } from '../i18n/I18nProvider';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

/**
 * Placeholder "you're logged in" screen — proves the auth flow works
 * end-to-end against the real backend (GET /couriers/me). Order
 * list/accept, live location sending, and navigation are later phases.
 */
export function HomeScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [courier, setCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Courier>('/couriers/me')
      .then(setCourier)
      .catch(() => setCourier(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('home.title')}</Text>

      <Text style={styles.label}>{t('home.loggedInAs')}</Text>
      <Text style={styles.value}>{user?.fullName ?? user?.email}</Text>

      <Text style={styles.label}>{t('home.status')}</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.value}>{courier ? t(`status.${courier.status}`) : '—'}</Text>
      )}

      <TouchableOpacity style={styles.button} onPress={() => logout()}>
        <Text style={styles.buttonText}>{t('home.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 80, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '600', color: '#111827', marginBottom: 24 },
  label: { fontSize: 13, color: '#6b7280', marginTop: 16 },
  value: { fontSize: 18, color: '#111827', marginTop: 2 },
  button: {
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
});
