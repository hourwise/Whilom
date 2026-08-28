import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import PlaceDetailScreen from '../../src/screens/PlaceDetailScreen';
import { developmentDataSource } from '../../src/lib/fixtures';

export default function PlaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = developmentDataSource.placeById(id);
  if (!place) return <View><Text>Place not found</Text></View>;
  return <PlaceDetailScreen place={place} />;
}
