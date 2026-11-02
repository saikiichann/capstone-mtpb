import { supabase, SUPABASE_BUCKET } from "../supabase";

// Image compression helper — re-encodes as JPEG (which also drops anything
// that isn't image data), shrinking quality until it fits maxSizeKB.
export const compressImage = async (
  file: File,
  maxSizeKB: number = 500,
  maxDimension: number = 1024
): Promise<File> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > height) {
        if (width > maxDimension) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      const qualities = [0.7, 0.55, 0.4];
      const encode = (i: number) =>
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }
            if (blob.size > maxSizeKB * 1024 && i < qualities.length - 1) {
              encode(i + 1);
              return;
            }
            resolve(
              new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })
            );
          },
          "image/jpeg",
          qualities[i]
        );
      encode(0);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    img.src = objectUrl;
  });
};

// Upload violation photo
export const uploadViolationPhoto = async (
  file: File,
  cin: string,
  slotName: string = "photo"
): Promise<string | null> => {
  try {
    const compressed = await compressImage(file, 500, 1024);
    const fileName = `${slotName}-${Date.now()}.jpg`;
    const filePath = `violations/${cin}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, compressed, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err) {
    console.error("Error uploading violation photo:", err);
    return null;
  }
};

// Upload OR/CR document
export const uploadOrCrDocument = async (
  file: File,
  cin: string,
  type: "or" | "cr"
): Promise<string | null> => {
  try {
    const compressed = await compressImage(file, 500, 1024);
    const fileName = `${type}-document-${Date.now()}.jpg`;
    const filePath = `or-cr/${cin}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, compressed, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err) {
    console.error(`Error uploading ${type.toUpperCase()} document:`, err);
    return null;
  }
};

// Upload payment receipt
export const uploadPaymentReceipt = async (
  file: File,
  cin: string
): Promise<string | null> => {
  try {
    const compressed = await compressImage(file, 300, 800);
    const fileName = `receipt-${Date.now()}.jpg`;
    const filePath = `receipts/${cin}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, compressed, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err) {
    console.error("Error uploading payment receipt:", err);
    return null;
  }
};