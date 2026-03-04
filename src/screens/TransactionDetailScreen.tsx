import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Share,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNBlobUtil from 'react-native-blob-util';
import { Transaction, RootStackParamList } from '../models/types';
import { deleteTransaction, uploadBillImage, deleteBillImage } from '../services/FirebaseService';
import firestore from '@react-native-firebase/firestore';
import { formatCurrency, formatDate, COLORS } from '../utils/helpers';

type RouteProps = RouteProp<RootStackParamList, 'TransactionDetail'>;

// ── Bill section (reimbursement only) ─────────────────────────────────────────

function BillSection({ transaction }: { transaction: Transaction }) {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Build a filesystem-safe filename from the expense details
  const safeName = [
    transaction.merchant ?? 'expense',
    String(Math.round(transaction.amount)),
    new Date(transaction.timestamp).toISOString().slice(0, 10),
  ]
    .join('_')
    .replace(/[^a-zA-Z0-9_\-]/g, '');

  const pickAndUpload = async (source: 'camera' | 'gallery') => {
    const options = { mediaType: 'photo' as const, quality: 0.82 as const };
    const result =
      source === 'camera'
        ? await launchCamera(options)
        : await launchImageLibrary(options);

    if (result.didCancel || !result.assets?.[0]?.uri) return;

    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      await uploadBillImage(transaction.id, uri);
      // Firestore real-time listener in the parent will pick up the new billImageUrl automatically
    } catch (err) {
      Alert.alert('Upload failed', 'Could not save the bill. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddBill = () => {
    Alert.alert('Add Bill', 'How would you like to add the bill?', [
      { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
      { text: 'Choose from Gallery', onPress: () => pickAndUpload('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleShareBill = async () => {
    if (!transaction.billImageUrl) return;
    setDownloading(true);
    try {
      const url = transaction.billImageUrl;

      // Dev mock: billImageUrl is a local file:// URI — share it directly without HTTP download
      if (!url.startsWith('http')) {
        const localPath = url.replace('file://', '');
        if (Platform.OS === 'ios') {
          await RNBlobUtil.ios.openDocument(localPath);
        } else {
          await Share.share({ message: localPath });
        }
        return;
      }

      // Production: download from Firebase Storage then open share sheet with the expense filename
      const localPath = `${RNBlobUtil.fs.dirs.CacheDir}/${safeName}.jpg`;
      await RNBlobUtil.config({ path: localPath }).fetch('GET', url);

      if (Platform.OS === 'ios') {
        await RNBlobUtil.ios.openDocument(localPath);
      } else {
        await RNBlobUtil.android.actionViewIntent(localPath, 'image/jpeg');
      }
    } catch {
      Alert.alert('Download failed', 'Could not download the bill. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleRemoveBill = () => {
    Alert.alert('Remove Bill', 'Delete the attached bill photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteBillImage(transaction.id);
        },
      },
    ]);
  };

  // ── Bill attached ──
  if (transaction.billImageUrl) {
    return (
      <View style={styles.billCard}>
        <Text style={styles.billCardTitle}>Bill / Receipt</Text>
        <Image
          source={{ uri: transaction.billImageUrl }}
          style={styles.billImage}
          resizeMode="cover"
        />
        <View style={styles.billActions}>
          <TouchableOpacity
            style={styles.billShareBtn}
            onPress={handleShareBill}
            activeOpacity={0.8}
            disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.billShareText}>
                {Platform.OS === 'ios' ? '⬆️  Share as "{safeName}.jpg"' : `⬇️  Save "${safeName}.jpg"`}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.billRemoveBtn}
            onPress={handleRemoveBill}
            activeOpacity={0.75}>
            <Text style={styles.billRemoveText}>Remove</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.billFilenameHint}>
          File will be saved as: {safeName}.jpg
        </Text>
      </View>
    );
  }

  // ── No bill yet ──
  return (
    <View style={styles.billCard}>
      <Text style={styles.billCardTitle}>Bill / Receipt</Text>
      <Text style={styles.billEmptyHint}>
        Attach the physical bill so you can file it with your expense report later.
      </Text>
      <View style={styles.billAddRow}>
        <TouchableOpacity
          style={styles.billAddBtn}
          onPress={() => pickAndUpload('camera')}
          activeOpacity={0.8}
          disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.billAddIcon}>📸</Text>
              <Text style={styles.billAddText}>Take Photo</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.billAddBtn, styles.billAddBtnSecondary]}
          onPress={() => pickAndUpload('gallery')}
          activeOpacity={0.8}
          disabled={uploading}>
          <Text style={styles.billAddIcon}>🖼</Text>
          <Text style={[styles.billAddText, styles.billAddTextSecondary]}>
            Upload from Gallery
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function TransactionDetailScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { transactionId, trackerType } = route.params;

  const [transaction, setTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const unsub = firestore()
      .collection('transactions')
      .doc(transactionId)
      .onSnapshot(doc => {
        if (doc.exists) {
          setTransaction({ id: doc.id, ...doc.data() } as Transaction);
        }
      });
    return unsub;
  }, [transactionId]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(transactionId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  if (!transaction) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  const trackerLabels: Record<string, string> = {
    personal: 'Personal',
    group: 'Group',
    reimbursement: 'Reimbursement',
  };

  return (
    <ScrollView style={styles.container}>
      {/* Amount */}
      <View style={styles.amountSection}>
        <Text style={styles.amountLabel}>Amount</Text>
        <Text style={styles.amount}>{formatCurrency(transaction.amount)}</Text>
      </View>

      {/* Details */}
      <View style={styles.detailCard}>
        <DetailRow label="Description" value={transaction.description} />
        {transaction.merchant && (
          <DetailRow label="Merchant" value={transaction.merchant} />
        )}
        <DetailRow label="Date" value={formatDate(transaction.timestamp)} />
        <DetailRow label="Source" value={transaction.source.toUpperCase()} />
        <DetailRow label="Tracker" value={trackerLabels[transaction.trackerType]} />
        {transaction.category && (
          <DetailRow label="Category" value={transaction.category} />
        )}
      </View>

      {/* Bill section — only for reimbursement */}
      {trackerType === 'reimbursement' && (
        <BillSection transaction={transaction} />
      )}

      {/* Raw SMS/email */}
      {transaction.rawMessage && (
        <View style={styles.rawMessageCard}>
          <Text style={styles.rawMessageTitle}>
            {transaction.source === 'email' ? 'Original Email' : 'Original SMS'}
          </Text>
          <Text style={styles.rawMessageText}>{transaction.rawMessage}</Text>
        </View>
      )}

      {/* Delete */}
      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteText}>Delete Transaction</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },

  // ── Amount ──
  amountSection: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  amountLabel: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  amount: { fontSize: 40, fontWeight: '800', color: COLORS.danger },

  // ── Detail card ──
  detailCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: { fontSize: 14, color: COLORS.textSecondary },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    maxWidth: '60%',
    textAlign: 'right',
  },

  // ── Bill section ──
  billCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.reimbursementColor + '30',
  },
  billCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.reimbursementColor,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  billImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: COLORS.surfaceElevated,
  },
  billActions: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  billShareBtn: {
    flex: 1,
    backgroundColor: COLORS.primary + '18',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '35',
  },
  billShareText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  billRemoveBtn: {
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger + '50',
  },
  billRemoveText: { fontSize: 12, fontWeight: '600', color: COLORS.danger },
  billFilenameHint: {
    fontSize: 11,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },

  // ── No bill yet ──
  billEmptyHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },
  billAddRow: { flexDirection: 'row', gap: 10 },
  billAddBtn: {
    flex: 1,
    backgroundColor: COLORS.reimbursementColor,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  billAddBtnSecondary: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  billAddIcon: { fontSize: 22 },
  billAddText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  billAddTextSecondary: { color: COLORS.text },

  // ── Raw message ──
  rawMessageCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  rawMessageTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  rawMessageText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
    fontFamily: 'monospace',
  },

  // ── Delete ──
  deleteButton: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 40,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  deleteText: { fontSize: 15, fontWeight: '600', color: COLORS.danger },
});
