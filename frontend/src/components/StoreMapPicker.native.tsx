import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, MapPressEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

type LatLng = { latitude: number; longitude: number };

const INDIA_CENTER: Region = {
  latitude: 20.5937, longitude: 78.9629, latitudeDelta: 20, longitudeDelta: 20,
};

type Props = {
  visible: boolean;
  latitude: string;
  longitude: string;
  onConfirm: (lat: string, lng: string) => void;
  onClose: () => void;
};

export default function StoreMapPicker({ visible, latitude, longitude, onConfirm, onClose }: Props) {
  const [mapPin, setMapPin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapView>(null);

  const initialRegion = (): Region => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng))
      return { latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    return INDIA_CENTER;
  };

  const onShow = () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    setMapPin(!isNaN(lat) && !isNaN(lng) ? { latitude: lat, longitude: lng } : null);
  };

  const useMyLocation = async () => {
    setLocating(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocating(false);
      Alert.alert('Permission denied', 'Allow location access to use this feature.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const pin = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    setMapPin(pin);
    mapRef.current?.animateToRegion({ ...pin, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
    setLocating(false);
  };

  const confirm = () => {
    if (!mapPin) return;
    onConfirm(mapPin.latitude.toFixed(6), mapPin.longitude.toFixed(6));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion()}
          onPress={(e: MapPressEvent) => setMapPin(e.nativeEvent.coordinate)}
        >
          {mapPin && (
            <Marker
              coordinate={mapPin}
              draggable
              onDragEnd={e => setMapPin(e.nativeEvent.coordinate)}
              pinColor={colors.brandPrimary}
            />
          )}
        </MapView>

        <SafeAreaView edges={['top']} style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.iconBtn}>
            <Feather name="x" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Tap map to place pin</Text>
          <Pressable onPress={useMyLocation} disabled={locating} style={styles.iconBtn}>
            {locating
              ? <ActivityIndicator size="small" color={colors.brandPrimary} />
              : <Feather name="navigation" size={18} color={colors.brandPrimary} />}
          </Pressable>
        </SafeAreaView>

        {mapPin && (
          <View style={styles.pinPreview}>
            <Text style={styles.pinText}>
              {mapPin.latitude.toFixed(6)}, {mapPin.longitude.toFixed(6)}
            </Text>
          </View>
        )}

        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <Pressable
            onPress={confirm}
            disabled={!mapPin}
            style={[styles.confirmBtn, !mapPin && { opacity: 0.4 }]}
          >
            <Feather name="check" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.confirmText}>Use this location</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, gap: spacing.sm },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface, textAlign: 'center' },
  pinPreview: { position: 'absolute', top: 80, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pinText: { fontFamily: fonts.textMedium, fontSize: 12, color: '#fff' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xl, paddingTop: spacing.md },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md },
  confirmText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onBrandPrimary },
});
