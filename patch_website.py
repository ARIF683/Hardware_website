import re

with open('/tmp/website_repo/src/services/supabaseService.ts', 'r') as f:
    content = f.read()

# Fix encodeURIComponent in updateItemQty
content = content.replace(
    "fetch(`${this.url}/rest/v1/items?id=eq.${id}`",
    "fetch(`${this.url}/rest/v1/items?id=eq.${encodeURIComponent(id)}`"
)

with open('/tmp/website_repo/src/services/supabaseService.ts', 'w') as f:
    f.write(content)

print("supabaseService.ts patched")

with open('/tmp/website_repo/src/components/ItemsScreen.tsx', 'r') as f:
    content = f.read()

# Add useRef
content = content.replace(
    "import React, { useState, useMemo } from 'react';",
    "import React, { useState, useMemo, useRef } from 'react';"
)

# Add Image import to lucide-react if not present
if "Image," not in content:
    content = content.replace(
        "  Trash2,",
        "  Trash2,\n  Image,"
    )

# Deconstruct updateMultipleItemsImage and showToast
content = content.replace(
    "const { items, deleteMultipleItems, isAdmin } = useStock();",
    "const { items, deleteMultipleItems, updateMultipleItemsImage, showToast, isAdmin } = useStock();"
)

# Add states and handlers
target_ref = "  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());"
new_states = """  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBulkImage, setIsUploadingBulkImage] = useState(false);

  const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedIds.size === 0) return;
    setIsUploadingBulkImage(true);
    try {
      const url = await supabaseService.uploadImageToCloudinary(file);
      await updateMultipleItemsImage(Array.from(selectedIds), url);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (err: any) {
      console.error('Bulk image upload error:', err);
      showToast(`Image upload failed: ${err?.message || 'Error'}`);
    } finally {
      setIsUploadingBulkImage(false);
      if (e.target) e.target.value = '';
    }
  };"""

content = content.replace(target_ref, new_states)

# Add buttons
target_buttons = """            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>
            )}"""

new_buttons = """            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleBulkImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingBulkImage}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-xs disabled:opacity-50"
                >
                  <Image className="w-3.5 h-3.5" />
                  {isUploadingBulkImage ? 'Uploading...' : 'Set Photo'}
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected
                </button>
              </div>
            )}"""

content = content.replace(target_buttons, new_buttons)

with open('/tmp/website_repo/src/components/ItemsScreen.tsx', 'w') as f:
    f.write(content)

print("ItemsScreen.tsx patched successfully")
