import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
} from 'react-native';
import { Search, Filter, Package, Calendar, Building } from 'lucide-react-native';
import { router } from 'expo-router';
import { searchProducts } from '../../utils/productData'; // Import from your productData file

export default function SearchTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredProducts([]);
    } else {
      const results = searchProducts(query);
      setFilteredProducts(results);
    }
  };

  const handleProductSelect = (productId: string) => {
    router.push(`/product-detail?code=${encodeURIComponent(productId)}`);
  };

  const renderProduct = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => handleProductSelect(item.id)}
    >
      <View style={styles.productHeader}>
        <View style={styles.productIcon}>
          <Package size={20} color="#1E40AF" />
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productId}>{item.id}</Text>
          <Text style={styles.productName}>{item.name}</Text>
        </View>
        <View style={styles.quantityBadge}>
          <Text style={styles.quantityText}>Qty: {item.quantity}</Text>
        </View>
      </View>
      
      <View style={styles.productDetails}>
        <View style={styles.detailRow}>
          <Building size={14} color="#6B7280" />
          <Text style={styles.detailText}>{item.company}</Text>
        </View>
        <View style={styles.detailRow}>
          <Calendar size={14} color="#6B7280" />
          <Text style={styles.detailText}>{item.date}</Text>
        </View>
      </View>
      
      <Text style={styles.projectText}>{item.project}</Text>
      {item.specifications?.dimensions && (
        <Text style={styles.dimensionsText}>Dimensions: {item.specifications.dimensions}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search Parts</Text>
        <Text style={styles.headerSubtitle}>Find parts by ItemTracking, QR code, piece #, or project</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Piece #, ItemTracking, QR code..."
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => {/* Add filter functionality if needed */}}
          >
            <Filter size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
          </Text>
        </View>

        <FlatList
          data={filteredProducts}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.productsList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            searchQuery.trim() ? (
              <View style={styles.emptyState}>
                <Package size={48} color="#9CA3AF" strokeWidth={1} />
                <Text style={styles.emptyText}>No products found</Text>
                <Text style={styles.emptySubtext}>
                  Try searching with different terms
                </Text>
                <Text style={styles.searchHint}>
                  Try: EXTJ3MALL, INTKCST, P41426, 5418, Standard Duct, etc.
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Search size={48} color="#9CA3AF" strokeWidth={1} />
                <Text style={styles.emptyText}>Start searching</Text>
                <Text style={styles.emptySubtext}>
                  Enter a product ID, name, project, or company
                </Text>
              </View>
            )
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  filterButton: {
    padding: 4,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  productsList: {
    padding: 20,
    gap: 16,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
  },
  productId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 2,
  },
  productName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  quantityBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quantityText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  productDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#6B7280',
  },
  projectText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  dimensionsText: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 8,
  },
  searchHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
// import React, { useState } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   TextInput,
//   TouchableOpacity,
//   FlatList,
//   StatusBar,
// } from 'react-native';
// import { Search, Filter, Package, Calendar, Building } from 'lucide-react-native';
// import { router } from 'expo-router';

// // Sample product data based on the Excel files
// const sampleProducts = [
//   {
//     id: 'X250009258',
//     name: 'Standard Duct',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     company: 'ALMULLA INDUSTRIES',
//     type: 'Standard Duct',
//     dimensions: '305 x 305',
//     quantity: 4,
//     date: '2025-06-30',
//   },
//   {
//     id: 'X250009259',
//     name: 'Radius Elbow',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     company: 'ALMULLA INDUSTRIES',
//     type: 'Radius Elbow',
//     dimensions: '305 x 305',
//     quantity: 2,
//     date: '2025-06-30',
//   },
//   {
//     id: 'X250009260',
//     name: 'End Cap',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     company: 'ALMULLA INDUSTRIES',
//     type: 'End Cap',
//     dimensions: '305 x 305',
//     quantity: 1,
//     date: '2025-06-30',
//   },
//   {
//     id: 'X250009261',
//     name: 'Transition 4 Piece',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     company: 'ALMULLA INDUSTRIES',
//     type: 'Transition',
//     dimensions: '305 x 305',
//     quantity: 3,
//     date: '2025-06-30',
//   },
// ];

// export default function SearchTab() {
//   const [searchQuery, setSearchQuery] = useState('');
//   const [filteredProducts, setFilteredProducts] = useState(sampleProducts);
//   const [showFilters, setShowFilters] = useState(false);

//   const handleSearch = (query: string) => {
//     setSearchQuery(query);
//     if (query.trim() === '') {
//       setFilteredProducts(sampleProducts);
//     } else {
//       const filtered = sampleProducts.filter(product =>
//         product.id.toLowerCase().includes(query.toLowerCase()) ||
//         product.name.toLowerCase().includes(query.toLowerCase()) ||
//         product.project.toLowerCase().includes(query.toLowerCase()) ||
//         product.type.toLowerCase().includes(query.toLowerCase())
//       );
//       setFilteredProducts(filtered);
//     }
//   };

//   const handleProductSelect = (productId: string) => {
//     router.push(`/product-detail?code=${encodeURIComponent(productId)}`);
//   };

//   const renderProduct = ({ item }: { item: typeof sampleProducts[0] }) => (
//     <TouchableOpacity
//       style={styles.productCard}
//       onPress={() => handleProductSelect(item.id)}
//     >
//       <View style={styles.productHeader}>
//         <View style={styles.productIcon}>
//           <Package size={20} color="#1E40AF" />
//         </View>
//         <View style={styles.productInfo}>
//           <Text style={styles.productId}>{item.id}</Text>
//           <Text style={styles.productName}>{item.name}</Text>
//         </View>
//         <View style={styles.quantityBadge}>
//           <Text style={styles.quantityText}>Qty: {item.quantity}</Text>
//         </View>
//       </View>
      
//       <View style={styles.productDetails}>
//         <View style={styles.detailRow}>
//           <Building size={14} color="#6B7280" />
//           <Text style={styles.detailText}>{item.company}</Text>
//         </View>
//         <View style={styles.detailRow}>
//           <Calendar size={14} color="#6B7280" />
//           <Text style={styles.detailText}>{item.date}</Text>
//         </View>
//       </View>
      
//       <Text style={styles.projectText}>{item.project}</Text>
//       <Text style={styles.dimensionsText}>Dimensions: {item.dimensions}</Text>
//     </TouchableOpacity>
//   );

//   return (
//     <View style={styles.container}>
//       <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
//       {/* Header */}
//       <View style={styles.header}>
//         <Text style={styles.headerTitle}>Search Products</Text>
//         <Text style={styles.headerSubtitle}>Find products by code, name, or project</Text>
//       </View>

//       {/* Search Bar */}
//       <View style={styles.searchContainer}>
//         <View style={styles.searchBar}>
//           <Search size={20} color="#6B7280" />
//           <TextInput
//             style={styles.searchInput}
//             placeholder="Search products..."
//             value={searchQuery}
//             onChangeText={handleSearch}
//             autoCapitalize="none"
//             returnKeyType="search"
//           />
//           <TouchableOpacity
//             style={styles.filterButton}
//             onPress={() => setShowFilters(!showFilters)}
//           >
//             <Filter size={20} color="#6B7280" />
//           </TouchableOpacity>
//         </View>
//       </View>

//       {/* Results */}
//       <View style={styles.resultsContainer}>
//         <View style={styles.resultsHeader}>
//           <Text style={styles.resultsCount}>
//             {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
//           </Text>
//         </View>

//         <FlatList
//           data={filteredProducts}
//           renderItem={renderProduct}
//           keyExtractor={(item) => item.id}
//           contentContainerStyle={styles.productsList}
//           showsVerticalScrollIndicator={false}
//           ListEmptyComponent={
//             <View style={styles.emptyState}>
//               <Package size={48} color="#9CA3AF" strokeWidth={1} />
//               <Text style={styles.emptyText}>No products found</Text>
//               <Text style={styles.emptySubtext}>
//                 Try adjusting your search terms
//               </Text>
//             </View>
//           }
//         />
//       </View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#F9FAFB',
//   },
//   header: {
//     backgroundColor: '#FFFFFF',
//     paddingTop: 60,
//     paddingHorizontal: 20,
//     paddingBottom: 20,
//     borderBottomWidth: 1,
//     borderBottomColor: '#E5E7EB',
//   },
//   headerTitle: {
//     fontSize: 28,
//     fontWeight: '700',
//     color: '#111827',
//     marginBottom: 4,
//   },
//   headerSubtitle: {
//     fontSize: 16,
//     color: '#6B7280',
//     lineHeight: 24,
//   },
//   searchContainer: {
//     backgroundColor: '#FFFFFF',
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: '#E5E7EB',
//   },
//   searchBar: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#F3F4F6',
//     borderRadius: 12,
//     paddingHorizontal: 16,
//     paddingVertical: 12,
//     gap: 12,
//   },
//   searchInput: {
//     flex: 1,
//     fontSize: 16,
//     color: '#111827',
//   },
//   filterButton: {
//     padding: 4,
//   },
//   resultsContainer: {
//     flex: 1,
//   },
//   resultsHeader: {
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     backgroundColor: '#FFFFFF',
//   },
//   resultsCount: {
//     fontSize: 14,
//     fontWeight: '500',
//     color: '#6B7280',
//   },
//   productsList: {
//     padding: 20,
//     gap: 16,
//   },
//   productCard: {
//     backgroundColor: '#FFFFFF',
//     borderRadius: 12,
//     padding: 16,
//     borderWidth: 1,
//     borderColor: '#E5E7EB',
//     shadowColor: '#000000',
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.05,
//     shadowRadius: 2,
//     elevation: 2,
//   },
//   productHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 12,
//   },
//   productIcon: {
//     width: 40,
//     height: 40,
//     borderRadius: 8,
//     backgroundColor: '#EBF4FF',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: 12,
//   },
//   productInfo: {
//     flex: 1,
//   },
//   productId: {
//     fontSize: 14,
//     fontWeight: '600',
//     color: '#1E40AF',
//     marginBottom: 2,
//   },
//   productName: {
//     fontSize: 16,
//     fontWeight: '500',
//     color: '#111827',
//   },
//   quantityBadge: {
//     backgroundColor: '#F3F4F6',
//     paddingHorizontal: 8,
//     paddingVertical: 4,
//     borderRadius: 6,
//   },
//   quantityText: {
//     fontSize: 12,
//     fontWeight: '500',
//     color: '#6B7280',
//   },
//   productDetails: {
//     flexDirection: 'row',
//     gap: 16,
//     marginBottom: 8,
//   },
//   detailRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 6,
//   },
//   detailText: {
//     fontSize: 13,
//     color: '#6B7280',
//   },
//   projectText: {
//     fontSize: 14,
//     fontWeight: '500',
//     color: '#111827',
//     marginBottom: 4,
//   },
//   dimensionsText: {
//     fontSize: 13,
//     color: '#6B7280',
//   },
//   emptyState: {
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingVertical: 60,
//   },
//   emptyText: {
//     fontSize: 18,
//     fontWeight: '500',
//     color: '#6B7280',
//     marginTop: 16,
//     marginBottom: 4,
//   },
//   emptySubtext: {
//     fontSize: 14,
//     color: '#9CA3AF',
//     textAlign: 'center',
//   },
// });