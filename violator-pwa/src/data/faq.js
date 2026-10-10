// Questions shown on the FAQs screen, grouped into the four segments.
//
// `**bold**` inside an answer is rendered in bold (see FaqAnswer in
// src/pages/FaqChatbot.jsx) — it's used for the office address, the way the
// Figma mockup shows it.
//
// The five entries marked CONFIRMED use the wording MTPB gave us. The rest
// were written to match that voice.
// TODO(team): have MTPB check the unmarked answers before the defense.
export const FAQ_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'payment', label: 'Payment' },
  { id: 'clamp', label: 'Clamp' },
  { id: 'impound', label: 'Impound' },
  { id: 'release', label: 'Release' },
]

export const MTPB_ADDRESS = 'Central Market, Santa Cruz, Manila, 1008 Metro Manila'

export const FAQ_ENTRIES = [
  // ---- Payment ----
  {
    id: 'pay-onsite',
    category: 'payment',
    question: 'Where can I pay my violation on-site?',
    // CONFIRMED
    answer:
      'You may visit the MTPB Office located at **Central Market, Santa Cruz, Manila, 1008 Metro Manila** to settle your violation payment. Please bring your violation details, reference number (if available), and a valid ID for verification and processing.',
    link: { to: '/impound', label: 'See the location and directions' },
  },
  {
    id: 'pay-how',
    category: 'payment',
    question: 'How do I pay my violation?',
    answer:
      'Scan the QR code attached to the clamp, then tap **Pay Now** on the violation details. You may pay online through **GCash**, or choose **Pay On-site** and settle the amount at the MTPB Office.',
  },
  {
    id: 'pay-account',
    category: 'payment',
    question: 'Do I need an account to pay?',
    answer:
      'No. After tapping Pay Now you may choose **Pay now as guest** and complete the payment without registering. An account is only needed if you want to keep your receipts and view all of your violations later.',
  },
  {
    id: 'pay-fee',
    category: 'payment',
    question: 'Is there an additional fee when paying online?',
    answer:
      'Yes. GCash charges a small convenience fee for each transaction. The exact amount is shown together with the fine on the confirmation screen, so you always see the total before you pay.',
  },
  {
    id: 'pay-receipt',
    category: 'payment',
    question: 'Can I get another copy of my receipt?',
    answer:
      'If you entered your email when paying, the MTPB receipt is emailed to you right after the payment. You can also download it from the receipt page before closing it. If you paid as a **guest** without an email and the page is closed, a copy must be requested at the MTPB Office. With an account, your receipts remain in History → Payment History.',
  },
  {
    id: 'pay-not-reflected',
    category: 'payment',
    question: 'My payment was deducted but the violation still shows unpaid.',
    answer:
      'Please wait a moment and reopen the violation, as confirmation may take a few minutes. Once received, it shows as **Paid – awaiting verification** until MTPB staff verify it. If it still shows unpaid, visit the MTPB Office with your **reference number** or your GCash confirmation, and personnel will verify the transaction.',
  },

  // ---- Clamp ----
  {
    id: 'clamp-what-to-do',
    category: 'clamp',
    question: 'What should I do if my vehicle was clamped?',
    // CONFIRMED
    answer:
      'Scan the QR code attached to the clamp using your mobile device. The system will display your violation details, fine amount, payment options, and instructions for settling the violation.',
  },
  {
    id: 'clamp-why',
    category: 'clamp',
    question: 'Why was my vehicle clamped?',
    answer:
      'An MTPB enforcer recorded a parking or traffic violation against your vehicle. Scanning the QR code on the clamp will show the violation, the location, the enforcer on record, the fine, and the photos taken at the scene.',
  },
  {
    id: 'clamp-contest',
    category: 'clamp',
    question: 'What should I do if I want to contest or question a violation?',
    // CONFIRMED
    answer:
      'If you believe a violation was issued incorrectly, you may personally visit the MTPB Office at **Central Market, Santa Cruz, Manila, 1008 Metro Manila** and present supporting documents or evidence. Authorized MTPB personnel will review your concern and provide further instructions.',
  },
  {
    id: 'clamp-remove-self',
    category: 'clamp',
    question: 'Can I remove the clamp myself?',
    answer:
      'No. Removing or damaging the clamp is a separate offense and carries additional penalties on top of your fine. Only authorized MTPB personnel may remove it.',
  },
  {
    id: 'clamp-qr-fails',
    category: 'clamp',
    question: 'The QR code on the clamp will not scan. What should I do?',
    answer:
      'Please clean the sticker and try again in better lighting. If it still will not scan, visit the MTPB Office with your **plate number** and the location of your vehicle, and personnel will look up the violation for you.',
  },

  // ---- Impound ----
  {
    id: 'impound-online',
    category: 'impound',
    question: 'Can I pay for an impounded vehicle online?',
    // CONFIRMED
    answer:
      'No. Payments for **impounded vehicles** must be processed on-site at the MTPB Office. Vehicle owners are required to undergo document verification and release procedures before the vehicle can be released.',
    link: { to: '/impound', label: 'See the location and directions' },
  },
  {
    id: 'impound-where',
    category: 'impound',
    question: 'Where is the impound area?',
    answer:
      'Impounded vehicles are taken to the **Central Market Impounding area, Santa Cruz, Manila**. The map in this app shows the exact location and can open directions for you.',
    link: { to: '/impound', label: 'See it on the map' },
  },
  {
    id: 'impound-belongings',
    category: 'impound',
    question: 'What happens to the belongings inside my vehicle?',
    answer:
      'If you are present during towing, please take any valuables with you. Items left inside remain in the vehicle at the impound area, so it is best to claim your vehicle as soon as possible.',
  },

  // ---- Release ----
  {
    id: 'release-documents',
    category: 'release',
    question: 'What documents should I bring when claiming a released vehicle?',
    // CONFIRMED
    answer:
      'Vehicle owners should bring a valid government-issued ID, proof of ownership or authorization, proof of payment, and any other documents required by MTPB personnel during the verification process.',
  },
  {
    id: 'release-how',
    category: 'release',
    question: 'How do I get my vehicle released after paying?',
    answer:
      'For a **clamped vehicle**, please stay with it after paying and wait for an enforcer to arrive and remove the clamp. For an **impounded vehicle**, proceed to the MTPB Office with the documents listed above.',
  },
  {
    id: 'release-how-long',
    category: 'release',
    question: 'How long before the clamp is removed after I pay?',
    answer:
      'Usually about **15 to 20 minutes**. Your payment notifies MTPB that the violation has been settled, and an enforcer is dispatched to remove the clamp. Please remain with your vehicle so they can locate it.',
  },
  {
    id: 'release-other-person',
    category: 'release',
    question: 'Can someone else claim the vehicle for me?',
    answer:
      'Yes, provided they present an **authorization letter** signed by the registered owner, the owner’s ID, and their own valid ID, together with the proof of ownership and proof of payment.',
  },
]
