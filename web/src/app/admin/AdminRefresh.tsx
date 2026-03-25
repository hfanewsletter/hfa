'use client'
import { useState } from 'react'
import UploadForm from '@/components/admin/UploadForm'
import PDFList from '@/components/admin/PDFList'
import ScheduleManager from '@/components/admin/ScheduleManager'

export default function AdminRefresh() {
  const [refreshTick, setRefreshTick] = useState(0)

  return (
    <div className="space-y-8">
      <UploadForm onUploadDone={() => setRefreshTick(t => t + 1)} />
      <UploadForm
        uploadUrl="/api/admin/upload-editorial"
        title="Upload Editorial PDFs"
        description="Drop editorial or opinion PDFs here. Articles will appear under the Editorial section and be included in the email digest."
      />
      <PDFList refreshTrigger={refreshTick} />
      <ScheduleManager />
    </div>
  )
}
