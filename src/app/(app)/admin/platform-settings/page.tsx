export const dynamic = "force-dynamic";

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Platform Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Global platform configuration — coming soon.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-gray-200 px-8 py-16 text-center">
        <p className="text-sm text-gray-400">
          Future: default languages, export settings, API key management, and more.
        </p>
      </div>
    </div>
  );
}
