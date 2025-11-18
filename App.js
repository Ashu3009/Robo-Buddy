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
        colors={['#0a1628', '#1e3a8a', '#2563eb', '#3b82f6']}
        style={styles.gradient}
      >
        <ScrollView
          horizontal={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >

          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="logo-android" size={50} color="white" />
            </View>
            <Text style={styles.title}>Buddy Bot</Text>
            <Text style={styles.subtitle}>Your Teaching Assistant</Text>
          </View>

          {/* CURRENT STATUS */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <MaterialIcons name="speaker-notes" size={20} color="#93c5fd" />
              <Text style={styles.statusTitle}>Current Status</Text>
            </View>

            <View style={styles.statusBox}>
              <Text style={styles.statusText}>{currentLine}</Text>
              {(isSpeaking || isLoading) && (
                <ActivityIndicator size="small" color="#93c5fd" style={styles.loader} />
              )}
            </View>
          </View>

          {/* UPLOAD SECTION */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="cloud-upload" size={18} color="#93c5fd" />
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
              <MaterialIcons name="edit-note" size={18} color="#93c5fd" />
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
              <MaterialIcons name="library-books" size={18} color="#93c5fd" />
              <Text style={styles.cardTitle}>Quick Templates</Text>
            </View>

            <View style={styles.sampleButtons}>
              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => loadSample("welcome")}
              >
                <MaterialIcons name="waving-hand" size={18} color="#93c5fd" />
                <Text style={styles.sampleBtnText}>Welcome</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => loadSample("math")}
              >
                <MaterialIcons name="calculate" size={18} color="#93c5fd" />
                <Text style={styles.sampleBtnText}>Math</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sampleBtn}
                onPress={() => loadSample("science")}
              >
                <MaterialIcons name="science" size={18} color="#93c5fd" />
                <Text style={styles.sampleBtnText}>Science</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SPEED CONTROL */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="speed" size={18} color="#93c5fd" />
              <Text style={styles.cardTitle}>Speech Speed: {speechRate.toFixed(1)}x</Text>
            </View>

            <View style={styles.speedButtons}>
              <TouchableOpacity
                style={styles.speedBtn}
                onPress={() => setSpeechRate(Math.max(0.5, speechRate - 0.1))}
              >
                <MaterialIcons name="remove" size={16} color="white" />
                <Text style={styles.speedBtnText}>Slower</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => setSpeechRate(0.9)}
              >
                <MaterialIcons name="restart-alt" size={16} color="white" />
                <Text style={styles.speedBtnText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.speedBtn}
                onPress={() => setSpeechRate(Math.min(1.5, speechRate + 0.1))}
              >
                <MaterialIcons name="add" size={16} color="white" />
                <Text style={styles.speedBtnText}>Faster</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* TEST AUDIO */}
          <TouchableOpacity style={styles.testBtn} onPress={testSpeech}>
            <MaterialIcons name="volume-up" size={18} color="white" />
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
                <Ionicons name="play-circle" size={50} color="white" />
                <Text style={styles.mainBtnText}>Start Teaching</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.stopButton} onPress={stopSpeaking}>
                <Ionicons name="stop-circle" size={50} color="white" />
                <Text style={styles.mainBtnText}>Stop Teaching</Text>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// STYLES - UNIFIED TRANSPARENT BLUEISH DESIGN
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628'
  },
  gradient: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    paddingHorizontal: 50,
    paddingTop: 15,
    paddingBottom: 20
  },
  header: {
    alignItems: "center",
    marginBottom: 18
  },
  iconContainer: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: "#60a5fa",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10
  },
  title: {
    fontSize: 36,
    color: "white",
    fontWeight: "bold",
    letterSpacing: 2,
    textShadowColor: 'rgba(96, 165, 250, 0.8)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8
  },
  subtitle: {
    color: "#bfdbfe",
    marginTop: 5,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1
  },
  statusCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)'
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 8
  },
  statusBox: {
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
    minHeight: 60,
    justifyContent: 'center'
  },
  statusText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    lineHeight: 22
  },
  loader: {
    marginTop: 8
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: '#fff',
    marginLeft: 8,
    flex: 1,
    letterSpacing: 0.5
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 10,
    gap: 8
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  uploadButtonHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  convertButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    padding: 12,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14
  },
  uploadButtonTextSmall: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12
  },
  helpText: {
    fontSize: 11,
    color: '#bfdbfe',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic'
  },
  helpTextSmall: {
    fontSize: 10,
    color: '#93c5fd',
    textAlign: 'center',
    marginTop: 3,
    fontWeight: '600'
  },
  fileNameText: {
    marginTop: 8,
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center'
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  clearBtnText: {
    color: '#fca5a5',
    fontWeight: '600',
    fontSize: 12
  },
  textInput: {
    borderWidth: 1,
    borderColor: "rgba(147, 197, 253, 0.3)",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 14,
    minHeight: 90,
    textAlignVertical: "top",
    fontSize: 14,
    lineHeight: 20,
    color: '#fff'
  },
  charCount: {
    textAlign: "right",
    color: "#93c5fd",
    marginTop: 6,
    fontSize: 11,
    fontWeight: '500'
  },
  sampleButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  sampleBtn: {
    padding: 12,
    backgroundColor: "rgba(59, 130, 246, 0.25)",
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.4)'
  },
  sampleBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12
  },
  speedButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  speedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: "#8b5cf6",
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  speedBtnText: {
    color: "white",
    fontWeight: '600',
    fontSize: 12
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)'
  },
  testBtnText: {
    color: "white",
    fontWeight: "600",
    fontSize: 13
  },
  mainControls: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10
  },
  playButton: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 50,
    backgroundColor: "#10b981",
    borderRadius: 18,
    minWidth: 280,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  stopButton: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 50,
    backgroundColor: "#ef4444",
    borderRadius: 18,
    minWidth: 280,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  mainBtnText: {
    color: "white",
    fontWeight: "800",
    marginTop: 10,
    fontSize: 18,
    letterSpacing: 1
  },
  disabledBtn: {
    opacity: 0.5
  }
});
