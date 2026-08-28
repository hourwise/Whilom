import { useLocalSearchParams } from 'expo-router';
import TripDetailScreen from '../../src/screens/TripDetailScreen';

export default function TripDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TripDetailScreen tripId={id ?? ''} />;
}
