import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Linking
} from 'react-native';
import * as Speech from 'expo-speech';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

export default function App() {
  const [lessonText, setLessonText] = useState('');
  const [currentLine, setCurrentLine] = useState('Ready to teach');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const shouldContinueSpeaking = useRef(true);

  // Default Lessons
  const sampleLessons = {
    welcome: `Hello Students! Welcome to our classroom.
I am your teaching robot.
I will help you learn new things.
Let's start our lesson today.
Please listen carefully.
Learning is fun!`,

    math: `Today we learn Mathematics.
Two plus two equals four.
Five plus three equals eight.
Ten minus five equals five.
Math helps us solve problems.
Practice makes perfect!`,

    science: `Welcome to Science class!
Science helps us understand the world.
The Sun gives us light and heat.
Plants need water to grow.
We breathe oxygen from the air.
Science is everywhere around us!`
  };

  useEffect(() => {
    setLessonText(sampleLessons.welcome);
    checkSpeechAvailability();
  }, []);

  const checkSpeechAvailability = async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if (!voices || voices.length === 0) {
        Alert.alert("Warning", "No speech voices available on this device.");
      }
    } catch (e) {
      console.log("Speech Error:", e);
    }
  };

  const startSpeaking = async () => {
    if (!lessonText.trim()) {
      Alert.alert("Error", "Please enter some text!");
      return;
    }

    try {
      setIsSpeaking(true);
      shouldContinueSpeaking.current = true;
      setCurrentLine("Starting...");

      // STOP previous speech
      Speech.stop();

      // Split text properly
      const sentences = lessonText
        .replace(/\n/g, ". ")
        .split(/(?<=[.?!])\s+/)
        .filter(s => s.trim().length > 0);

      let index = 0;

      const speakNext = () => {
        if (!shouldContinueSpeaking.current || index >= sentences.length) {
          setIsSpeaking(false);
          setCurrentLine("Lesson Completed");
          return;
        }

        const sentence = sentences[index].trim();
        setCurrentLine(sentence);

        Speech.speak(sentence, {
          rate: speechRate,
          pitch: 1,
          onDone: () => {
            index++;
            speakNext();
          },
          onError: () => {
            index++;
            speakNext();
          }
        });
      };

      speakNext();

    } catch (err) {
      Alert.alert("Error", err.message);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    shouldContinueSpeaking.current = false;
    Speech.stop();
    setIsSpeaking(false);
    setCurrentLine("Stopped");

    setTimeout(() => {
      setCurrentLine("Ready to teach");
    }, 2000);
  };

  const testSpeech = () => {
    Speech.speak("Testing audio. Hello!", {
      rate: 0.9,
      pitch: 1,
      onDone: () => Alert.alert("Success", "Audio working!")
    });
  };

  const convertPDFToText = async (pdfUri, fileName) => {
    try {
      setCurrentLine("Converting PDF to text...");

      // Read PDF as base64
      const base64 = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.Base64
      });

      console.log('PDF file size (base64):', base64.length);

      // Use ConvertAPI free service
      const response = await fetch('https://v2.convertapi.com/convert/pdf/to/txt?Secret=secret_free_trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Parameters: [
            {
              Name: 'File',
              FileValue: {
                Name: fileName,
                Data: base64
              }
            }
          ]
        })
      });

      const result = await response.json();
      console.log('ConvertAPI response:', result);

      if (result.Files && result.Files.length > 0) {
        // Download the converted text file
        const txtUrl = result.Files[0].Url;
        const txtResponse = await fetch(txtUrl);
        const textContent = await txtResponse.text();

        console.log('Extracted text length:', textContent.length);
        return textContent;
      } else {
        throw new Error('No output from converter');
      }
    } catch (error) {
      console.error('PDF conversion error:', error);
      throw error;
    }
  };

  const openPDFConverter = () => {
    Alert.alert(
      "Convert PDF to Text",
      "Choose an option to convert your PDF:",
      [
        {
          text: "Online Converter",
          onPress: () => Linking.openURL('https://www.pdf2txt.de/')
        },
        {
          text: "Copy/Paste Text",
          onPress: () => Alert.alert("Copy PDF Text", "1. Open your PDF\n2. Select all text (Ctrl+A)\n3. Copy it (Ctrl+C)\n4. Paste here in the lesson box")
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const pickDocument = async () => {
    try {
      setIsLoading(true);
      setCurrentLine("Opening file picker...");

      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false
      });

      console.log('=== FILE PICKER DEBUG ===');
      console.log('Result:', JSON.stringify(result, null, 2));

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setIsLoading(false);
        setCurrentLine("Ready to teach");
        return;
      }

      const file = result.assets[0];
      console.log('Selected file name:', file.name);
      console.log('File URI:', file.uri);
      console.log('File type:', file.mimeType);
      console.log('File size:', file.size);

      setUploadedFileName(file.name);
      setCurrentLine(`Reading ${file.name}...`);

      // Check file type
      const isTextFile = file.name.endsWith('.txt') ||
                        file.mimeType === 'text/plain' ||
                        file.mimeType?.startsWith('text/');

      if (!isTextFile && (file.name.endsWith('.pdf') || file.mimeType === 'application/pdf')) {
        // Try automatic PDF conversion
        try {
          const extractedText = await convertPDFToText(file.uri, file.name);

          if (extractedText && extractedText.trim().length > 0) {
            setLessonText(extractedText.trim());
            setCurrentLine("PDF converted successfully!");
            setIsLoading(false);
            Alert.alert(
              "✅ PDF Converted!",
              `${file.name}\n\n${extractedText.length} characters extracted from PDF\n\nReady to teach!`,
              [{ text: "OK" }]
            );
            return;
          } else {
            throw new Error("No text found in PDF");
          }
        } catch (pdfError) {
          console.error('Auto PDF conversion failed:', pdfError);
          setIsLoading(false);
          setUploadedFileName('');
          setCurrentLine("Ready to teach");
          Alert.alert(
            "PDF Auto-Convert Failed",
            "Automatic conversion didn't work. Please use manual options:",
            [
              { text: "Manual Convert", onPress: openPDFConverter },
              { text: "OK" }
            ]
          );
          return;
        }
      }

      try {
        // Read file using updated API
        const content = await FileSystem.readAsStringAsync(file.uri);

        console.log('Content read successfully!');
        console.log('Content length:', content?.length);
        console.log('First 100 chars:', content?.substring(0, 100));

        if (content && content.trim().length > 0) {
          setLessonText(content);
          setCurrentLine("File loaded successfully!");
          setIsLoading(false);
          Alert.alert(
            "Success!",
            `${file.name}\n\n${content.length} characters loaded\n\nPress "Start Teaching" to begin!`,
            [{ text: "OK" }]
          );
        } else {
          throw new Error("File is empty");
        }
      } catch (readErr) {
        console.error('=== FILE READ ERROR ===');
        console.error('Error:', readErr);
        console.error('Error message:', readErr.message);

        setUploadedFileName('');
        setCurrentLine("Ready to teach");
        setIsLoading(false);

        Alert.alert(
          "Could Not Read File",
          `Unable to read this file.\n\nPlease try:\n\n1. Save as .txt file\n2. Or copy-paste content into the text box below\n\nTechnical error: ${readErr.message}`,
          [
            { text: "OK" }
          ]
        );
      }
    } catch (err) {
      console.error('=== PICKER ERROR ===');
      console.error('Error:', err);
      setIsLoading(false);
      setCurrentLine("Ready to teach");
      Alert.alert("Error", `Failed to open file picker\n\n${err.message}`);
    }
  };

  const loadSample = (type) => {
    setLessonText(sampleLessons[type]);
    setCurrentLine("Lesson loaded! Press Start Teaching.");
    setUploadedFileName('');
  };

  const clearText = () => {
    setLessonText('');
    setCurrentLine("Ready to teach");
    setUploadedFileName('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1e3c72', '#2a5298', '#7e22ce']}
        style={styles.gradient}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >

          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="school-outline" size={50} color="white" />
            </View>
            <Text style={styles.title}>Teaching Assistant</Text>
            <Text style={styles.subtitle}>Professional Learning Platform</Text>
          </View>

          {/* CURRENT STATUS */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <MaterialIcons name="speaker-notes" size={24} color="#2a5298" />
              <Text style={styles.statusTitle}>Current Status</Text>
            </View>

            <View style={styles.statusBox}>
              <Text style={styles.statusText}>{currentLine}</Text>
              {(isSpeaking || isLoading) && (
                <ActivityIndicator size="small" color="#2a5298" style={styles.loader} />
              )}
            </View>
          </View>

          {/* UPLOAD SECTION */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="cloud-upload" size={22} color="#2a5298" />
              <Text style={styles.cardTitle}>Upload Document</Text>
            </View>

            <View style={styles.uploadRow}>
              <TouchableOpacity
                style={styles.uploadButtonHalf}
                onPress={pickDocument}
                disabled={isLoading}
              >
                <MaterialIcons name="attach-file" size={20} color="white" />
                <Text style={styles.uploadButtonTextSmall}>Upload TXT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.convertButton}
                onPress={openPDFConverter}
              >
                <MaterialIcons name="picture-as-pdf" size={20} color="white" />
                <Text style={styles.uploadButtonTextSmall}>Convert PDF</Text>
              </TouchableOpacity>
            </View>

            {uploadedFileName && (
              <Text style={styles.fileNameText}>{uploadedFileName}</Text>
            )}

            <Text style={styles.helpText}>
              TXT files work best. For PDF: Convert first or paste text below.
            </Text>
            <Text style={styles.helpTextSmall}>
              Tip: You can always copy-paste your content directly into the text box!
            </Text>
          </View>

          {/* INPUT AREA */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="edit-note" size={22} color="#2a5298" />
              <Text style={styles.cardTitle}>Lesson Content</Text>
              <TouchableOpacity onPress={clearText} style={styles.clearButton}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.textInput}
              multiline
              value={lessonText}
              onChangeText={setLessonText}
              placeholder="Type or paste your lesson here..."
              placeholderTextColor="#999"
            />

            <Text style={styles.charCount}>{lessonText.length} characters</Text>
          </View>

          {/* SAMPLE LESSONS */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="library-books" size={22} color="#2a5298" />
              <Text style={styles.cardTitle}>Quick Templates</Text>
            </View>

            <View style={styles.sampleButtons}>
              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => loadSample("welcome")}
              >
                <MaterialIcons name="waving-hand" size={20} color="#2a5298" />
                <Text style={styles.sampleBtnText}>Welcome</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => loadSample("math")}
              >
                <MaterialIcons name="calculate" size={20} color="#2a5298" />
                <Text style={styles.sampleBtnText}>Math</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => loadSample("science")}
              >
                <MaterialIcons name="science" size={20} color="#2a5298" />
                <Text style={styles.sampleBtnText}>Science</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SPEED CONTROL */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="speed" size={22} color="#2a5298" />
              <Text style={styles.cardTitle}>Speech Speed: {speechRate.toFixed(1)}x</Text>
            </View>

            <View style={styles.speedButtons}>
              <TouchableOpacity
                style={styles.speedBtn}
                onPress={() => setSpeechRate(Math.max(0.5, speechRate - 0.1))}
              >
                <MaterialIcons name="remove" size={18} color="white" />
                <Text style={styles.speedBtnText}>Slower</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => setSpeechRate(0.9)}
              >
                <MaterialIcons name="restart-alt" size={18} color="white" />
                <Text style={styles.speedBtnText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.speedBtn}
                onPress={() => setSpeechRate(Math.min(1.5, speechRate + 0.1))}
              >
                <MaterialIcons name="add" size={18} color="white" />
                <Text style={styles.speedBtnText}>Faster</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* TEST AUDIO */}
          <TouchableOpacity style={styles.testBtn} onPress={testSpeech}>
            <MaterialIcons name="volume-up" size={20} color="white" />
            <Text style={styles.testBtnText}>Test Audio</Text>
          </TouchableOpacity>

          {/* PLAY / STOP */}
          <View style={styles.mainControls}>
            {!isSpeaking ? (
              <TouchableOpacity
                style={[styles.playButton, isLoading && styles.disabledBtn]}
                onPress={startSpeaking}
                disabled={isLoading}
              >
                <Ionicons name="play-circle" size={60} color="white" />
                <Text style={styles.mainBtnText}>Start Teaching</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.stopButton} onPress={stopSpeaking}>
                <Ionicons name="stop-circle" size={60} color="white" />
                <Text style={styles.mainBtnText}>Stop Teaching</Text>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e3c72'
  },
  gradient: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    paddingTop: 30,
    paddingBottom: 40
  },
  header: {
    alignItems: "center",
    marginBottom: 30
  },
  iconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  title: {
    fontSize: 32,
    color: "white",
    fontWeight: "bold",
    letterSpacing: 0.5
  },
  subtitle: {
    color: "#E0E7FF",
    marginTop: 8,
    fontSize: 15,
    fontWeight: '500'
  },
  statusCard: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e3c72',
    marginLeft: 8
  },
  statusBox: {
    backgroundColor: "#F0F4FF",
    padding: 18,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2a5298',
    minHeight: 70,
    justifyContent: 'center'
  },
  statusText: {
    fontSize: 16,
    color: '#1e3c72',
    fontWeight: '500',
    lineHeight: 24
  },
  loader: {
    marginTop: 8
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: '#1e3c72',
    marginLeft: 8,
    flex: 1
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a5298',
    padding: 16,
    borderRadius: 12,
    gap: 10
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10
  },
  uploadButtonHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a5298',
    padding: 14,
    borderRadius: 12,
    gap: 6
  },
  convertButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 12,
    gap: 6
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15
  },
  uploadButtonTextSmall: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic'
  },
  helpTextSmall: {
    fontSize: 11,
    color: '#10b981',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600'
  },
  fileNameText: {
    marginTop: 10,
    color: '#2a5298',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center'
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 8
  },
  clearBtnText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 14
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    minHeight: 160,
    textAlignVertical: "top",
    fontSize: 15,
    lineHeight: 22,
    color: '#1e3c72'
  },
  charCount: {
    textAlign: "right",
    color: "#9CA3AF",
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500'
  },
  sampleButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  sampleBtn: {
    padding: 14,
    backgroundColor: "#F0F4FF",
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#E0E7FF'
  },
  sampleBtnText: {
    color: "#2a5298",
    fontWeight: "700",
    fontSize: 13
  },
  speedButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  speedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: "#2a5298",
    borderRadius: 10,
    gap: 6
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: "#7e22ce",
    borderRadius: 10,
    gap: 6
  },
  speedBtnText: {
    color: "white",
    fontWeight: '600',
    fontSize: 13
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "rgba(255,255,255,0.2)",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  testBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15
  },
  mainControls: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20
  },
  playButton: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 40,
    backgroundColor: "#10b981",
    borderRadius: 20,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 220
  },
  stopButton: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 40,
    backgroundColor: "#ef4444",
    borderRadius: 20,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 220
  },
  mainBtnText: {
    color: "white",
    fontWeight: "bold",
    marginTop: 12,
    fontSize: 18,
    letterSpacing: 0.5
  },
  disabledBtn: {
    opacity: 0.5
  }
});
