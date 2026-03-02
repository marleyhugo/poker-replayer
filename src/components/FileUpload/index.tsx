import { useState, useRef, useCallback, useEffect } from 'react';
import type { ParsedHand } from '../../types/poker';
import { parseMultipleHands } from '../../parsers';
import { getSavedApiKey, saveApiKey } from '../../services/geminiVision';
import styles from './FileUpload.module.css';

interface FileUploadProps {
  onHandsParsed: (hands: ParsedHand[]) => void;
}

export function FileUpload({ onHandsParsed }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setApiKey(getSavedApiKey()); }, []);

  const processText = useCallback((text: string) => {
    setError(null);
    try {
      const hands = parseMultipleHands(text);
      onHandsParsed(hands);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido ao analisar a mao.');
    }
  }, [onHandsParsed]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
      setError('Selecione um arquivo .txt de hand history.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') processText(result);
    };
    reader.readAsText(file, 'utf-8');
  }, [processText]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePasteSubmit = useCallback(() => {
    if (pasteText.trim()) {
      processText(pasteText);
      setShowPaste(false);
      setPasteText('');
    }
  }, [pasteText, processText]);

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem (PNG, JPG, etc.).');
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreview(url);
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [imagePreview]);

  const handleProcessImage = useCallback(async () => {
    if (!imageFile) return;
    if (!apiKey.trim()) {
      setError('Insira sua API key do Google Gemini.');
      return;
    }

    setProcessing(true);
    setError(null);
    saveApiKey(apiKey.trim());

    try {
      setProgress('Enviando imagem para Gemini...');
      const { analyzeScreenshot } = await import('../../services/geminiVision');
      const geminiData = await analyzeScreenshot(imageFile, apiKey.trim());

      setProgress('Montando hand history...');
      const { parseScreenshot } = await import('../../parsers/screenshotParser');
      const hand = parseScreenshot(geminiData);

      onHandsParsed([hand]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar imagem.');
    } finally {
      setProcessing(false);
      setProgress('');
    }
  }, [imageFile, apiKey, onHandsParsed]);

  return (
    <div className={styles.wrapper}>
      {/* Drag & drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Clique ou arraste um arquivo de hand history aqui"
        className={`${styles.dropZone} ${dragging ? styles.dragging : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div className={styles.icon} aria-hidden>🃏</div>
        <div className={styles.title}>Poker Hand Replayer</div>
        <div className={styles.subtitle}>
          Arraste um arquivo .txt aqui ou clique para selecionar
        </div>
        <div className={styles.formats}>
          PokerStars · GGPoker · 888 Poker · WPN
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          aria-hidden
          className={styles.hiddenInput}
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      <div className={styles.orRow}>
        <hr className={styles.hr} />
        <span>ou</span>
        <hr className={styles.hr} />
      </div>

      <button
        className={styles.pasteBtn}
        onClick={() => setShowPaste(v => !v)}
        aria-expanded={showPaste}
      >
        Cole o texto da hand history
      </button>

      {showPaste && (
        <div className={styles.pasteArea}>
          <label htmlFor="hh-textarea" className="sr-only">
            Texto da hand history
          </label>
          <textarea
            id="hh-textarea"
            className={styles.textarea}
            placeholder="Cole aqui o texto da sua hand history..."
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={8}
          />
          <button
            className={styles.parseBtn}
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim()}
          >
            Analisar
          </button>
        </div>
      )}

      <div className={styles.orRow}>
        <hr className={styles.hr} />
        <span>ou</span>
        <hr className={styles.hr} />
      </div>

      <button
        className={styles.screenshotBtn}
        onClick={() => imageInputRef.current?.click()}
        disabled={processing}
      >
        Enviar print da GGPoker
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        aria-hidden
        className={styles.hiddenInput}
        onChange={e => e.target.files?.[0] && handleImageSelect(e.target.files[0])}
      />

      {imagePreview && (
        <div className={styles.imagePreview}>
          <img src={imagePreview} alt="Preview do print" className={styles.previewImg} />
          {processing && (
            <div className={styles.processingOverlay}>
              <div className={styles.spinner} />
              <span className={styles.progressText}>{progress}</span>
            </div>
          )}
          <div className={styles.apiKeyRow}>
            <input
              type="password"
              className={styles.apiKeyInput}
              placeholder="Gemini API Key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={processing}
            />
          </div>
          <div className={styles.imageActions}>
            <button
              className={styles.processBtn}
              onClick={handleProcessImage}
              disabled={processing || !apiKey.trim()}
            >
              {processing ? 'Processando...' : 'Processar'}
            </button>
            <button
              className={styles.removeBtn}
              onClick={handleRemoveImage}
              disabled={processing}
            >
              Remover
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className={styles.error}>
          <strong>Erro:</strong> {error}
        </div>
      )}
    </div>
  );
}
