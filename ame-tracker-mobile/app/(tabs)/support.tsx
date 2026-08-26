import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';
import { Phone, Mail, MessageCircle, FileText, CircleHelp as HelpCircle, Settings, Info, ExternalLink } from 'lucide-react-native';

export default function SupportTab() {
  const handleContactPress = (type: 'phone' | 'email' | 'chat') => {
    switch (type) {
      case 'phone':
        Linking.openURL('tel:+1234567890');
        break;
      case 'email':
        Linking.openURL('mailto:support@almullaindustries.com');
        break;
      case 'chat':
        // Open chat or messaging app
        break;
    }
  };

  const supportItems = [
    {
      icon: HelpCircle,
      title: 'FAQ',
      subtitle: 'Frequently asked questions',
      onPress: () => {},
    },
    {
      icon: FileText,
      title: 'User Guide',
      subtitle: 'How to use the scanner app',
      onPress: () => {},
    },
    {
      icon: Settings,
      title: 'App Settings',
      subtitle: 'Configure app preferences',
      onPress: () => {},
    },
    {
      icon: Info,
      title: 'About',
      subtitle: 'App version and information',
      onPress: () => {},
    },
  ];

  const SupportItem = ({ icon: Icon, title, subtitle, onPress }: {
    icon: any;
    title: string;
    subtitle: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.supportItem} onPress={onPress}>
      <View style={styles.supportIcon}>
        <Icon size={24} color="#1E40AF" />
      </View>
      <View style={styles.supportContent}>
        <Text style={styles.supportTitle}>{title}</Text>
        <Text style={styles.supportSubtitle}>{subtitle}</Text>
      </View>
      <ExternalLink size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support & Help</Text>
        <Text style={styles.headerSubtitle}>Get help and contact support</Text>
      </View>

      <View style={styles.content}>
        {/* Contact Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Support</Text>
          
          <View style={styles.contactGrid}>
            <TouchableOpacity
              style={styles.contactCard}
              onPress={() => handleContactPress('phone')}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#EBF4FF' }]}>
                <Phone size={24} color="#1E40AF" />
              </View>
              <Text style={styles.contactTitle}>Call Us</Text>
              <Text style={styles.contactSubtitle}>+1 (234) 567-890</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactCard}
              onPress={() => handleContactPress('email')}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#F0FDF4' }]}>
                <Mail size={24} color="#16A34A" />
              </View>
              <Text style={styles.contactTitle}>Email</Text>
              <Text style={styles.contactSubtitle}>support@company.com</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contactCard}
              onPress={() => handleContactPress('chat')}
            >
              <View style={[styles.contactIcon, { backgroundColor: '#FEF3C7' }]}>
                <MessageCircle size={24} color="#D97706" />
              </View>
              <Text style={styles.contactTitle}>Live Chat</Text>
              <Text style={styles.contactSubtitle}>Available 24/7</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Help */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Help</Text>
          
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>How to scan QR codes</Text>
            <Text style={styles.helpText}>
              1. Tap "Scan QR Code" on the home screen{'\n'}
              2. Allow camera access when prompted{'\n'}
              3. Point your camera at the QR code{'\n'}
              4. Wait for automatic detection{'\n'}
              5. View product details
            </Text>
          </View>

          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>Manual code entry</Text>
            <Text style={styles.helpText}>
              If you can't scan the QR code, you can enter the product code manually using the text input field on the home screen.
            </Text>
          </View>
        </View>

        {/* Support Resources */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support Resources</Text>
          
          {supportItems.map((item, index) => (
            <SupportItem key={index} {...item} />
          ))}
        </View>

        {/* Company Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company Information</Text>
          
          <View style={styles.companyCard}>
            <Text style={styles.companyName}>ALMULLA INDUSTRIES</Text>
            <Text style={styles.companyDescription}>
              Industrial manufacturing and supply chain solutions
            </Text>
            <View style={styles.companyDetails}>
              <Text style={styles.companyText}>Version 1.0.0</Text>
              <Text style={styles.companyText}>© 2025 Almulla Industries</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
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
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  contactGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  contactCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  contactIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  contactSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  helpCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  supportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  supportIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  supportContent: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  supportSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  companyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
  },
  companyDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  companyDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  companyText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 4,
  },
});