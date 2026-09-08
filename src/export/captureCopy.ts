// Keep method names, explanations and runtime status terminology aligned in every locale.
interface CaptureCopy {
  labels: [string, string, string, string, string];
  experimental: string;
  heading: string; details: string; realtime: string; recording: string; settings: string;
  active: string; fallback: string; quality: string;
  notes: [string, string, string, string];
}
export const captureCopy: Record<string, CaptureCopy> = {
  en: {
    labels: ['Standard capture', 'Layered capture', 'Browser-native capture', 'Direct canvas capture', 'Parallel canvas rendering'], experimental: ' (experimental)',
    heading: 'Frame capture', details: 'About this capture method', realtime: 'Real-time recording', recording: 'Recording', settings: 'Video settings', active: 'Using {{method}}', fallback: 'The selected method is unavailable. Using Standard capture.',
    quality: 'Resolution, frame rate and bitrate are unchanged. Small visual differences may occur; compare the output before use. Switching tabs pauses export.',
    notes: ['Captures the original canvas surfaces and text separately, then composites and encodes them in parallel. Available for all templates; unsupported scenes fall back to Standard capture. The preview is hidden during export and restored afterward.', 'Requires a recent Chromium browser with {flag} enabled and a browser restart. Unsupported or failed capture falls back to Standard capture.', 'Available only for Fume with the Fluid light background. Composites the original canvas surfaces directly. No browser flags required.', 'Available only for Fume with the Fluid light background. Runs canvas lyric rendering and encoding on a separate thread. No browser flags required.'],
  },
  'zh-CN': {
    labels: ['标准画面捕获', '分层画面捕获', '浏览器原生捕获', '画布直接捕获', '画布并行渲染'], experimental: '（实验）',
    heading: '画面捕获', details: '查看捕获方式说明', realtime: '实时录制', recording: '正在录制', settings: '视频设置', active: '当前使用{{method}}', fallback: '所选方式无法使用，已回退标准画面捕获。',
    quality: '保持原分辨率、帧率和码率。可能存在细微画面差异，请对比效果后使用。切换标签页会暂停导出。',
    notes: ['分别捕获原始画布和文字，再并行合成与编码。所有模板均可尝试，不支持的场景自动回退标准画面捕获。导出期间暂时隐藏预览，结束后恢复。', '需要新版 Chromium 浏览器开启 {flag} 并重启浏览器。不支持或捕获失败时自动回退标准画面捕获。', '仅适用于浮名搭配流体织光背景，直接合成原始画布画面，无需开启浏览器实验开关。', '仅适用于浮名搭配流体织光背景，在独立线程中绘制画布歌词并编码，无需开启浏览器实验开关。'],
  },
  'zh-TW': {
    labels: ['標準畫面擷取', '分層畫面擷取', '瀏覽器原生擷取', '畫布直接擷取', '畫布平行繪製'], experimental: '（實驗）',
    heading: '畫面擷取', details: '查看擷取方式說明', realtime: '即時錄製', recording: '正在錄製', settings: '影片設定', active: '目前使用{{method}}', fallback: '所選方式無法使用，已退回標準畫面擷取。',
    quality: '保持原解析度、影格率與位元率。可能有細微畫面差異，請比較效果後使用。切換分頁會暫停匯出。',
    notes: ['分別擷取原始畫布與文字，再平行合成與編碼。所有範本均可嘗試，不支援的場景自動退回標準畫面擷取。匯出時暫時隱藏預覽，結束後恢復。', '需要新版 Chromium 瀏覽器啟用 {flag} 並重新啟動。不支援或擷取失敗時自動退回標準畫面擷取。', '僅適用於浮名搭配流體織光背景，直接合成原始畫布，不需啟用瀏覽器實驗開關。', '僅適用於浮名搭配流體織光背景，在獨立執行緒繪製畫布歌詞並編碼，不需啟用瀏覽器實驗開關。'],
  },
  id: {
    labels: ['Perekaman standar', 'Perekaman berlapis', 'Perekaman bawaan browser', 'Perekaman kanvas langsung', 'Rendering kanvas paralel'], experimental: ' (eksperimental)',
    heading: 'Perekaman gambar', details: 'Tentang metode ini', realtime: 'Perekaman waktu nyata', recording: 'Sedang merekam', settings: 'Pengaturan video', active: 'Menggunakan {{method}}', fallback: 'Metode yang dipilih tidak tersedia. Menggunakan perekaman standar.',
    quality: 'Resolusi, laju bingkai, dan bitrate tetap sama. Mungkin ada sedikit perbedaan visual; bandingkan hasilnya sebelum digunakan. Beralih tab menjeda ekspor.',
    notes: ['Merekam kanvas asli dan teks secara terpisah, lalu menggabungkan dan mengodekannya secara paralel. Dapat dicoba pada semua templat; adegan yang tidak didukung memakai perekaman standar. Pratinjau disembunyikan selama ekspor dan dipulihkan setelahnya.', 'Memerlukan Chromium terbaru, mengaktifkan {flag}, lalu memulai ulang browser. Jika tidak didukung atau gagal, perekaman standar digunakan.', 'Hanya untuk Fume dengan latar Cahaya mengalir. Menggabungkan kanvas asli secara langsung tanpa mengaktifkan fitur eksperimental browser.', 'Hanya untuk Fume dengan latar Cahaya mengalir. Menggambar lirik kanvas dan mengodekan video pada thread terpisah tanpa fitur eksperimental browser.'],
  },
  hi: {
    labels: ['मानक कैप्चर', 'परतों में कैप्चर', 'ब्राउज़र का मूल कैप्चर', 'सीधा कैनवास कैप्चर', 'समानांतर कैनवास रेंडरिंग'], experimental: ' (प्रायोगिक)',
    heading: 'फ़्रेम कैप्चर', details: 'इस तरीके के बारे में', realtime: 'रीयल-टाइम रिकॉर्डिंग', recording: 'रिकॉर्डिंग जारी है', settings: 'वीडियो सेटिंग', active: 'इस्तेमाल हो रहा है: {{method}}', fallback: 'चुना गया तरीका उपलब्ध नहीं है। मानक कैप्चर इस्तेमाल हो रहा है।',
    quality: 'रिज़ॉल्यूशन, फ़्रेम दर और बिटरेट समान रहते हैं। मामूली दृश्य अंतर हो सकते हैं; उपयोग से पहले परिणाम की तुलना करें। टैब बदलने पर निर्यात रुक जाता है।',
    notes: ['मूल कैनवास और टेक्स्ट को अलग-अलग कैप्चर करके समानांतर संयोजन और एन्कोडिंग करता है। सभी टेम्पलेट में आज़मा सकते हैं; असमर्थित दृश्य मानक कैप्चर पर लौटते हैं। निर्यात के दौरान प्रीव्यू छिपता है और बाद में लौट आता है।', 'नए Chromium ब्राउज़र में {flag} चालू करके ब्राउज़र पुनः शुरू करना आवश्यक है। असमर्थित या विफल कैप्चर मानक तरीके पर लौटता है।', 'केवल Fume और बहता प्रकाश पृष्ठभूमि के लिए। मूल कैनवास को सीधे जोड़ता है; ब्राउज़र के प्रायोगिक विकल्प आवश्यक नहीं हैं।', 'केवल Fume और बहता प्रकाश पृष्ठभूमि के लिए। अलग थ्रेड पर कैनवास के बोल बनाता है और एन्कोड करता है; ब्राउज़र के प्रायोगिक विकल्प आवश्यक नहीं हैं।'],
  },
  'pt-BR': {
    labels: ['Captura padrão', 'Captura em camadas', 'Captura nativa do navegador', 'Captura direta do canvas', 'Renderização paralela do canvas'], experimental: ' (experimental)',
    heading: 'Captura de imagem', details: 'Sobre este método', realtime: 'Gravação em tempo real', recording: 'Gravando', settings: 'Configurações de vídeo', active: 'Usando {{method}}', fallback: 'O método selecionado está indisponível. Usando captura padrão.',
    quality: 'Resolução, taxa de quadros e bitrate são mantidos. Pode haver pequenas diferenças visuais; compare o resultado antes de usá-lo. Trocar de aba pausa a exportação.',
    notes: ['Captura os canvas originais e o texto separadamente, depois compõe e codifica em paralelo. Disponível para todos os modelos; cenas incompatíveis usam captura padrão. A prévia fica oculta durante a exportação e é restaurada ao final.', 'Requer Chromium recente, ativação de {flag} e reinicialização do navegador. Capturas incompatíveis ou com falha usam o método padrão.', 'Somente para Fume com fundo Luz fluida. Compõe diretamente os canvas originais, sem opções experimentais do navegador.', 'Somente para Fume com fundo Luz fluida. Desenha as letras no canvas e codifica em uma thread separada, sem opções experimentais do navegador.'],
  },
  fil: {
    labels: ['Karaniwang pagkuha', 'Patong-patong na pagkuha', 'Katutubong pagkuha ng browser', 'Direktang pagkuha ng canvas', 'Sabayang pag-render ng canvas'], experimental: ' (eksperimental)',
    heading: 'Pagkuha ng larawan', details: 'Tungkol sa paraang ito', realtime: 'Real-time na pag-record', recording: 'Nire-record', settings: 'Mga setting ng video', active: 'Ginagamit: {{method}}', fallback: 'Hindi magagamit ang napiling paraan. Ginagamit ang karaniwang pagkuha.',
    quality: 'Hindi nagbabago ang resolution, frame rate at bitrate. Maaaring may kaunting pagkakaiba sa larawan; ihambing ang resulta bago gamitin. Hihinto muna ang pag-export kapag lumipat ng tab.',
    notes: ['Hiwalay na kinukuha ang orihinal na canvas at teksto, saka sabay na pinagsasama at ine-encode. Maaaring subukan sa lahat ng template; karaniwang pagkuha ang gamit sa hindi suportadong eksena. Nakatago ang preview habang nag-e-export at ibinabalik pagkatapos.', 'Kailangan ng bagong Chromium, paganahin ang {flag}, at i-restart ang browser. Karaniwang paraan ang gamit kung hindi suportado o nabigo ang pagkuha.', 'Para lamang sa Fume na may Umaagos na Liwanag na background. Direktang pinagsasama ang orihinal na canvas; hindi kailangan ng eksperimental na setting ng browser.', 'Para lamang sa Fume na may Umaagos na Liwanag na background. Gumuguhit ng lyrics sa canvas at nag-e-encode sa hiwalay na thread; hindi kailangan ng eksperimental na setting ng browser.'],
  },
  de: {
    labels: ['Standardaufnahme', 'Ebenenaufnahme', 'Browsernative Aufnahme', 'Direkte Canvas-Aufnahme', 'Paralleles Canvas-Rendering'], experimental: ' (experimentell)',
    heading: 'Bildaufnahme', details: 'Über diese Methode', realtime: 'Echtzeitaufnahme', recording: 'Aufnahme läuft', settings: 'Videoeinstellungen', active: 'Aktiv: {{method}}', fallback: 'Die gewählte Methode ist nicht verfügbar. Standardaufnahme wird verwendet.',
    quality: 'Auflösung, Bildrate und Bitrate bleiben gleich. Geringe Bildabweichungen sind möglich; vergleichen Sie das Ergebnis vor der Verwendung. Ein Tabwechsel pausiert den Export.',
    notes: ['Erfasst Original-Canvas und Text getrennt und verarbeitet Komposition und Kodierung parallel. Für alle Vorlagen verfügbar; nicht unterstützte Szenen nutzen die Standardaufnahme. Die Vorschau wird während des Exports ausgeblendet und danach wiederhergestellt.', 'Erfordert einen aktuellen Chromium-Browser, die Aktivierung von {flag} und einen Browserneustart. Nicht unterstützte oder fehlgeschlagene Aufnahmen nutzen die Standardmethode.', 'Nur für Fume mit Fließendes-Licht-Hintergrund. Setzt die Original-Canvas direkt zusammen. Keine experimentellen Browsereinstellungen nötig.', 'Nur für Fume mit Fließendes-Licht-Hintergrund. Zeichnet Canvas-Liedtext und kodiert in einem separaten Thread. Keine experimentellen Browsereinstellungen nötig.'],
  },
  ur: {
    labels: ['معیاری کیپچر', 'تہہ وار کیپچر', 'براؤزر کا مقامی کیپچر', 'براہ راست کینوس کیپچر', 'متوازی کینوس رینڈرنگ'], experimental: ' (تجرباتی)',
    heading: 'تصویر کیپچر', details: 'اس طریقے کی تفصیل', realtime: 'ریئل ٹائم ریکارڈنگ', recording: 'ریکارڈنگ جاری ہے', settings: 'ویڈیو کی ترتیبات', active: 'زیر استعمال: {{method}}', fallback: 'منتخب طریقہ دستیاب نہیں۔ معیاری کیپچر استعمال ہو رہا ہے۔',
    quality: 'ریزولوشن، فریم ریٹ اور بٹ ریٹ تبدیل نہیں ہوتے۔ معمولی بصری فرق ممکن ہے؛ استعمال سے پہلے نتیجے کا موازنہ کریں۔ ٹیب بدلنے سے ایکسپورٹ رک جاتا ہے۔',
    notes: ['اصل کینوس اور متن کو الگ کیپچر کرکے متوازی طور پر جوڑتا اور انکوڈ کرتا ہے۔ تمام ٹیمپلیٹس میں آزما سکتے ہیں؛ غیر معاون مناظر معیاری کیپچر استعمال کرتے ہیں۔ ایکسپورٹ کے دوران پیش نظارہ چھپتا ہے اور بعد میں بحال ہوتا ہے۔', 'نیا Chromium براؤزر، {flag} کو فعال کرنا اور براؤزر دوبارہ شروع کرنا ضروری ہے۔ عدم معاونت یا ناکامی پر معیاری کیپچر استعمال ہوتا ہے۔', 'صرف Fume اور بہتی روشنی پس منظر کے لیے۔ اصل کینوس براہ راست جوڑتا ہے؛ براؤزر کی تجرباتی ترتیبات ضروری نہیں۔', 'صرف Fume اور بہتی روشنی پس منظر کے لیے۔ الگ تھریڈ میں کینوس کے بول بناتا اور انکوڈ کرتا ہے؛ براؤزر کی تجرباتی ترتیبات ضروری نہیں۔'],
  },
  ru: {
    labels: ['Стандартный захват', 'Послойный захват', 'Встроенный захват браузера', 'Прямой захват canvas', 'Параллельный рендеринг canvas'], experimental: ' (экспериментальный)',
    heading: 'Захват изображения', details: 'Об этом способе', realtime: 'Запись в реальном времени', recording: 'Идёт запись', settings: 'Настройки видео', active: 'Используется: {{method}}', fallback: 'Выбранный способ недоступен. Используется стандартный захват.',
    quality: 'Разрешение, частота кадров и битрейт не меняются. Возможны небольшие визуальные отличия; сравните результат перед использованием. Переключение вкладки приостанавливает экспорт.',
    notes: ['Захватывает исходные canvas и текст отдельно, затем выполняет композицию и кодирование параллельно. Доступен для всех шаблонов; неподдерживаемые сцены используют стандартный захват. Предпросмотр скрывается на время экспорта и восстанавливается после него.', 'Нужен современный Chromium с включённым {flag} и перезапуск браузера. При отсутствии поддержки или ошибке используется стандартный захват.', 'Только для Fume с фоном «Струящийся свет». Напрямую объединяет исходные canvas. Экспериментальные настройки браузера не нужны.', 'Только для Fume с фоном «Струящийся свет». Рисует текст на canvas и кодирует в отдельном потоке. Экспериментальные настройки браузера не нужны.'],
  },
  vi: {
    labels: ['Chụp tiêu chuẩn', 'Chụp theo lớp', 'Chụp bằng trình duyệt', 'Chụp canvas trực tiếp', 'Kết xuất canvas song song'], experimental: ' (thử nghiệm)',
    heading: 'Chụp khung hình', details: 'Về phương thức này', realtime: 'Ghi hình thời gian thực', recording: 'Đang ghi hình', settings: 'Cài đặt video', active: 'Đang dùng: {{method}}', fallback: 'Phương thức đã chọn không khả dụng. Đang dùng chụp tiêu chuẩn.',
    quality: 'Giữ nguyên độ phân giải, tốc độ khung hình và bitrate. Có thể có khác biệt hình ảnh nhỏ; hãy so sánh kết quả trước khi dùng. Chuyển tab sẽ tạm dừng xuất.',
    notes: ['Chụp canvas gốc và văn bản riêng, rồi tổng hợp và mã hóa song song. Có thể thử với mọi mẫu; cảnh không được hỗ trợ sẽ dùng chụp tiêu chuẩn. Bản xem trước được ẩn khi xuất và khôi phục sau đó.', 'Cần Chromium mới, bật {flag} rồi khởi động lại trình duyệt. Nếu không được hỗ trợ hoặc chụp thất bại, sẽ dùng phương thức tiêu chuẩn.', 'Chỉ dành cho Fume với nền Ánh sáng chảy. Tổng hợp trực tiếp các canvas gốc, không cần bật tính năng thử nghiệm của trình duyệt.', 'Chỉ dành cho Fume với nền Ánh sáng chảy. Vẽ lời bài hát trên canvas và mã hóa trong luồng riêng, không cần bật tính năng thử nghiệm của trình duyệt.'],
  },
};

export function captureTranslations(copy: CaptureCopy): Record<string, string> {
  const result: Record<string, string> = {
    'export.captureMethod': copy.heading, 'export.methodDetails': copy.details,
    'export.realtimeLabel': copy.realtime, 'export.recordingLabel': copy.recording, 'export.settingsTitle': copy.settings,
    'export.nativeFallback': copy.fallback, 'export.layeredFallback': copy.fallback,
  };
  const methods = ['Standard', 'Layered', 'Native', 'Direct', 'Worker'];
  methods.forEach((method, index) => {
    result[`export.capture${method}`] = copy.labels[index] + (index ? copy.experimental : '');
    if (index) {
      const key = method.toLowerCase();
      result[`export.${key}Active`] = copy.active.replace('{{method}}', copy.labels[index]);
      result[`export.${key}Notice`] = `${copy.notes[index - 1].replace('{flag}', 'chrome://flags/#canvas-draw-element')} ${copy.quality}`;
    }
  });
  return result;
}
