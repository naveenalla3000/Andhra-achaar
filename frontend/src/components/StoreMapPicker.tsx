type Props = {
  visible: boolean;
  latitude: string;
  longitude: string;
  onConfirm: (lat: string, lng: string) => void;
  onClose: () => void;
};

export default function StoreMapPicker(_props: Props) {
  return null;
}
