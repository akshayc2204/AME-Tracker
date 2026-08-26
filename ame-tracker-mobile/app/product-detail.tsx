import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  ArrowLeft,
  Package,
  Calendar,
  Building,
  Ruler,
  Hash,
  MapPin,
  User,
  FileText,
  Share,
} from 'lucide-react-native';
import { getProductById } from '../utils/productData'; // Import from your productData file

export default function ProductDetail() {
  const params = useLocalSearchParams();
  const code = params.code as string;
  const product = getProductById(code);

  console.log('Looking for product code:', code);
  console.log('Found product:', product);

  const handleBack = () => {
    router.back();
  };

  const handleShare = () => {
    // Implement sharing functionality
    console.log('Share product:', product?.id || code);
  };

  const DetailRow = ({ icon: Icon, label, value, fullWidth = false }: {
    icon: any;
    label: string;
    value: string;
    fullWidth?: boolean;
  }) => (
    <View style={[styles.detailRow, fullWidth && styles.detailRowFull]}>
      <View style={styles.detailIcon}>
        <Icon size={16} color="#1E40AF" />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );

  // If product not found, show error state
  if (!product) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Part Details</Text>
            <Text style={styles.headerSubtitle}>{code}</Text>
          </View>
          
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Share size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.productCard}>
            <View style={styles.productHeader}>
              <View style={styles.productIcon}>
                <Package size={32} color="#EF4444" />
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>Product Not Found</Text>
                <Text style={styles.productType}>Unknown Product</Text>
                <View style={[styles.quantityBadge, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.quantityText, { color: '#EF4444' }]}>Code: {code}</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.errorMessage}>
              <Text style={styles.errorText}>
                The product with code "{code}" was not found in our database. 
                Please verify the code and try again.
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Product Details</Text>
          <Text style={styles.headerSubtitle}>{product.id}</Text>
        </View>
        
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Share size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Product Card */}
        <View style={styles.productCard}>
          <View style={styles.productHeader}>
            <View style={styles.productIcon}>
              <Package size={32} color="#1E40AF" />
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productType}>{product.type}</Text>
              <View style={styles.quantityBadge}>
                <Text style={styles.quantityText}>Quantity: {product.quantity}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Company Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company Information</Text>
          <View style={styles.card}>
            <DetailRow
              icon={Building}
              label="Company"
              value={product.company || 'N/A'}
              fullWidth
            />
            <DetailRow
              icon={MapPin}
              label="Project"
              value={product.project || 'N/A'}
              fullWidth
            />
            <DetailRow
              icon={FileText}
              label="Job"
              value={product.job || 'N/A'}
              fullWidth
            />
          </View>
        </View>

        {/* Product Specifications */}
        {product.specifications && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specifications</Text>
            <View style={styles.card}>
              {product.specifications.material && (
                <DetailRow
                  icon={Hash}
                  label="Material"
                  value={product.specifications.material}
                  fullWidth
                />
              )}
              {product.specifications.dimensions && (
                <DetailRow
                  icon={Ruler}
                  label="Dimensions"
                  value={product.specifications.dimensions}
                  fullWidth
                />
              )}
              {product.specifications.pressure && (
                <DetailRow
                  icon={FileText}
                  label="Pressure"
                  value={product.specifications.pressure}
                  fullWidth
                />
              )}
              {product.specifications.radius && (
                <DetailRow
                  icon={FileText}
                  label="Configuration"
                  value={product.specifications.radius}
                  fullWidth
                />
              )}
              {product.specifications.size && (
                <DetailRow
                  icon={Ruler}
                  label="Size"
                  value={product.specifications.size}
                  fullWidth
                />
              )}
            </View>
          </View>
        )}

        Measurements
        {product.measurements && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Measurements</Text>
            <View style={styles.card}>
              <View style={styles.measurementGrid}>
                {product.measurements.length && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Length</Text>
                    <Text style={styles.measurementValue}>{product.measurements.length}</Text>
                  </View>
                )}
                {product.measurements.width && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Width</Text>
                    <Text style={styles.measurementValue}>{product.measurements.width}</Text>
                  </View>
                )}
                {product.measurements.height && (
                  <View style={styles.measurementItem}>
                    <Text style={styles.measurementLabel}>Height</Text>
                    <Text style={styles.measurementValue}>{product.measurements.height}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Additional Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Details</Text>
          <View style={styles.card}>
            <DetailRow
              icon={Calendar}
              label="Date"
              value={product.date || 'N/A'}
              fullWidth
            />
            <DetailRow
              icon={Hash}
              label="DL Number"
              value={product.dlNumber || 'N/A'}
              fullWidth
            />
            
            {product.soNumber && (
              <DetailRow
                icon={FileText}
                label="SO Number"
                value={product.soNumber}
                fullWidth
              />
            )}
            
            {product.location && (
              <DetailRow
                icon={MapPin}
                label="Location"
                value={product.location}
                fullWidth
              />
            )}
            
            {product.temperature && (
              <DetailRow
                icon={FileText}
                label="Temperature"
                value={product.temperature}
                fullWidth
              />
            )}

            {product.weight && (
              <DetailRow
                icon={Hash}
                label="Weight"
                value={product.weight}
                fullWidth
              />
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton}>
            <FileText size={20} color="#1E40AF" />
            <Text style={styles.actionButtonText}>Generate Report</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton}>
            <Share size={20} color="#1E40AF" />
            <Text style={styles.actionButtonText}>Export Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#1E40AF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -30,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  productType: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  quantityBadge: {
    backgroundColor: '#EBF4FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  errorMessage: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 20,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  detailRowFull: {
    flex: 1,
    flexWrap: 'wrap',
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  measurementGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  measurementItem: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  measurementLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  measurementValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  actionsSection: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1E40AF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
  },
  bottomSpacer: {
    height: 40,
  },
});
