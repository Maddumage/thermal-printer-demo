import { useEffect, useRef, useState } from 'react';
// import QRCode from 'qrcode.react';
import QRCode from 'qrcode';

import './App.css';
import { PrintReceipt, BluetoothScanner } from './components';

const getBitmapFromUrl = (url: string) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    };
    img.onerror = (err) => {
      reject(err);
    };
  });
};

const convertBitmapToPrinterFormat = (bitmap: {
  width: any;
  height: any;
  data: any;
}) => {
  const width = bitmap.width;
  const height = bitmap.height;
  const imageData = bitmap.data;
  const threshold = 128; // Threshold for binary conversion

  const bytesPerLine = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerLine * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];
      const avg = (r + g + b) / 3;

      if (avg < threshold) {
        const byteIndex = y * bytesPerLine + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        data[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  // ESC/POS command to print the image
  const escPosImageHeader = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerLine & 0xff,
    (bytesPerLine >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);

  const spaces = '\n\n\n';
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(spaces);

  return new Uint8Array([...escPosImageHeader, ...data, ...encodedText]);
};

const generateReceiptContent = (tokenData: {
  customerId: any;
  service: any;
}) => {
  const { customerId, service } = tokenData;

  const receiptLines = [
    '',
    '',
    '',
    '',
    '==============================',
    "       Optician's Store       ",
    '    1234 Eye Care Avenue      ',
    '     Vision City, VC 12345    ',
    '==============================',
    `Date: ${new Date().toLocaleDateString()} Time: ${new Date().toLocaleTimeString()}`,
    '------------------------------',
    '  Thank you for choosing us!  ',
    '==============================',
  ];

  // Join the lines with newline characters
  return receiptLines.join('\n');
};

function App() {
  const contentToPrint = useRef(null);
  const [qrCodeData, setQrCodeData] = useState<any>();
  const [qrCode, setQrCode] = useState('');

  const tokenData = {
    customerId: '12345',
    service: 'Eye Examination',
  };

  const generateQRCode = async (
    text: string | QRCode.QRCodeSegment[],
    size: any
  ) => {
    try {
      const qrCodeUrl = await QRCode.toDataURL(text, { width: size });
      const bitmap = await getBitmapFromUrl(qrCodeUrl);
      const textData = prepareTextData();
      const combinedData = combineTextAndImage(textData, bitmap);
      setQrCodeData(combinedData);
      setQrCode(qrCodeUrl);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    generateQRCode(tokenData.customerId, 200);
  }, []);

  const prepareTextData = () => {
    const receiptContent = generateReceiptContent(tokenData);
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(receiptContent); // Add newline
    // ESC/POS command to align text to the center (optional, depends on your printer)
    const escPosCenter = new Uint8Array([0x1b, 0x61, 0x01]);
    // Combine ESC/POS command with the text
    return new Uint8Array([...escPosCenter, ...encodedText]);
  };

  const combineTextAndImage = (textData: ArrayLike<number>, bitmap: any) => {
    const imageData = convertBitmapToPrinterFormat(bitmap);
    const combinedData = new Uint8Array(textData.length + imageData.length);
    combinedData.set(textData, 0);
    combinedData.set(imageData, textData.length);
    console.log('Combined Data:', combinedData);
    return combinedData;
  };

  const connectBluetoothPrinter = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['49535343-fe7d-4ae5-8fa9-9fafd205e455'] }],
      });

      const server = await device?.gatt?.connect();
      const service = await server?.getPrimaryService(
        '49535343-fe7d-4ae5-8fa9-9fafd205e455'
      );
      const characteristic = await service?.getCharacteristic(
        '49535343-8841-43f4-a8d4-ecbe34729bb3'
      );

      // console.log('qrCodeData => ', qrCodeData);
      // const receiptContent = generateReceiptContent(tokenData, qrCodeData);
      // const imageData = convertBitmapToPrinterFormat(qrCodeData);
      // Convert your print content to a format supported by your printer
      // const encoder = new TextEncoder();
      // const data = encoder.encode(receiptContent);
      // const value = [...data,...imageData] as Uint8Array;
      // Split the data into chunks of 512 bytes or less
      const chunkSize = 512;
      for (let i = 0; i < qrCodeData.length; i += chunkSize) {
        const chunk = qrCodeData.slice(i, i + chunkSize);
        await characteristic?.writeValue(chunk);
        //  await delay(100); // Add a small delay between writes
      }
      console.log('Print successful');
    } catch (error) {
      console.error('Error connecting to printer:', error);
    }
  };

  return (
    <>
      <PrintReceipt ref={contentToPrint} tokenData={tokenData} />
      // Use this function in your component
      <button onClick={connectBluetoothPrinter}>Print Token</button>
      <BluetoothScanner />
      {qrCodeData && <img src={qrCode} alt="QR Code" />}
    </>
  );
}

export default App;
