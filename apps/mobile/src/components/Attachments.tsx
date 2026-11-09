import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ATTACHMENT_LIMITS, type AttachmentDto } from '@myfinances/shared';
import { api } from '../lib/api';
import { useColors } from '../lib/theme';

/** A picked file waiting to be uploaded (React Native FormData accepts { uri, name, type }). */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

/** Opens camera, photo library or document picker and returns the chosen files. */
export async function pickFiles(source: 'camera' | 'photos' | 'document'): Promise<LocalFile[]> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access in Settings to photograph bills.');
      return [];
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    return res.canceled ? [] : res.assets.map((a) => fromImageAsset(a));
  }
  if (source === 'photos') {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true });
    return res.canceled ? [] : res.assets.map((a) => fromImageAsset(a));
  }
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
  return res.canceled
    ? []
    : res.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/pdf', size: a.size }));
}

function fromImageAsset(a: ImagePicker.ImagePickerAsset): LocalFile {
  const type = a.mimeType ?? 'image/jpeg';
  const ext = type.split('/')[1] ?? 'jpg';
  return { uri: a.uri, name: a.fileName ?? `bill-${Date.now()}.${ext}`, type, size: a.fileSize };
}

export function tooLarge(f: LocalFile) {
  return f.size !== undefined && f.size > ATTACHMENT_LIMITS.maxBytes;
}

export function AttachmentStrip({
  workspaceId,
  expenseId,
  saved,
  pending,
  onAdd,
  onRemoveSaved,
  onRemovePending,
}: {
  workspaceId: string;
  expenseId?: string;
  saved: AttachmentDto[];
  pending: LocalFile[];
  onAdd: (source: 'camera' | 'photos' | 'document') => void;
  onRemoveSaved: (a: AttachmentDto) => void;
  onRemovePending: (f: LocalFile) => void;
}) {
  const c = useColors();
  const full = saved.length + pending.length >= ATTACHMENT_LIMITS.maxPerExpense;

  async function openSaved(a: AttachmentDto) {
    try {
      const url = `${api.baseUrl}${api.attachments.path(workspaceId, expenseId!, a.id)}`;
      const dest = new File(Paths.cache, `${a.id}-${a.fileName.replace(/[^\w.-]/g, '_')}`);
      const file = await File.downloadFileAsync(url, dest, { headers: api.authHeaders(), idempotent: true });
      await Sharing.shareAsync(file.uri, { mimeType: a.mimeType, dialogTitle: a.fileName });
    } catch (e) {
      Alert.alert('Could not open file', e instanceof Error ? e.message : String(e));
    }
  }

  const tile = { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: c.border } as const;

  return (
    <View style={{ gap: 10 }}>
      {(saved.length > 0 || pending.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {saved.map((a) => (
            <Pressable key={a.id} onPress={() => void openSaved(a)} onLongPress={() => onRemoveSaved(a)} style={tile}>
              {a.mimeType.startsWith('image/') && !a.mimeType.includes('hei') ? (
                <Image
                  source={{ uri: `${api.baseUrl}${api.attachments.path(workspaceId, expenseId!, a.id)}`, headers: api.authHeaders() }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <FileTile name={a.fileName} />
              )}
            </Pressable>
          ))}
          {pending.map((f) => (
            <Pressable key={f.uri} onLongPress={() => onRemovePending(f)} style={[tile, { opacity: 0.7 }]}>
              {f.type.startsWith('image/') ? (
                <Image source={{ uri: f.uri }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <FileTile name={f.name} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
      {(saved.length > 0 || pending.length > 0) && (
        <Text style={{ color: c.muted, fontSize: 12 }}>Tap to open · long-press to remove</Text>
      )}
      {!full && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SourceButton icon="camera-outline" label="Camera" onPress={() => onAdd('camera')} />
          <SourceButton icon="images-outline" label="Photos" onPress={() => onAdd('photos')} />
          <SourceButton icon="document-outline" label="PDF / file" onPress={() => onAdd('document')} />
        </View>
      )}
    </View>
  );
}

function FileTile({ name }: { name: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}>
      <Ionicons name="document-text-outline" size={28} color={c.muted} />
      <Text numberOfLines={2} style={{ color: c.muted, fontSize: 10, textAlign: 'center' }}>
        {name}
      </Text>
    </View>
  );
}

function SourceButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}
    >
      <Ionicons name={icon} size={20} color={c.brand} />
      <Text style={{ color: c.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
