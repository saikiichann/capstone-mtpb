// Every piece of text on the guest screens, in English and Filipino.
// `{name}` is filled in by t('key', { name }). Keep both lists in the same
// order so a missing line is easy to spot.
//
// Wording: everyday Filipino as used in Philippine government and payment
// apps. Terms people already use in English (GCash, QR code, clamp,
// enforcer, guest, account, email, Reference Number) stay in English.
// TODO(Marco): have a Filipino speaker on the team read the `fil` lines once.

const en = {
  // Shared
  'common.goBack': 'Go back',
  'common.payNow': 'Pay Now',
  'common.readFaqs': 'Read the FAQs',
  'common.somethingWrong': 'Something went wrong',
  'common.pleaseWait': 'Please wait.',
  'common.mapShowing': 'Map showing {name}',
  // Same hours as OFFICE_HOURS in src/data/contact.js: change both.
  'common.officeHours': 'Monday to Friday, 8:00 AM – 5:00 PM',

  // Status badges
  'status.unpaid': 'unpaid',
  'status.paid': 'paid',
  'status.verifying': 'paid – awaiting verification',
  'status.clamped': 'clamped',
  'status.impounded': 'impounded',

  // Step header
  'step.of': 'Step {step} of {total}',

  // Scanned clamp
  'scan.title': 'Scanned Clamp',
  'scan.loading': 'Reading the clamp’s code…',
  'scan.error': 'We couldn’t read this clamp’s code. Check your connection and scan again.',
  'scan.clamp': 'Clamp',
  'scan.waiting.title': 'Nothing to pay on this clamp',
  'scan.waiting.1': 'No violation has been recorded on this clamp yet.',
  'scan.waiting.2': 'If an enforcer just clamped your vehicle, give them a moment to finish and scan again.',
  'scan.released.title': 'This clamp has been released',
  'scan.released.1': 'The violation on this clamp is settled and the clamp has been removed.',
  'scan.released.2': 'If your vehicle is still clamped, please contact the MTPB office.',
  'scan.notFound.title': 'Clamp not found',
  'scan.notFound.1': 'This code isn’t registered with MTPB.',
  'scan.notFound.2': 'Check that you scanned the sticker on the clamp, or contact the MTPB office.',
  'scan.unknown.title': 'Clamp not ready',
  'scan.unknown.1': 'This clamp has no violation you can pay right now.',
  'scan.unknown.2': 'Please contact the MTPB office if your vehicle is clamped.',
  'scan.noCode.title': 'No clamp code in that link',
  'scan.noCode.text':
    'The QR code didn’t include a clamp number. Please check the sticker on the clamp, or visit the MTPB office with your plate number and they’ll look up the violation for you.',

  // Violation loading / errors
  'violation.loading': 'Loading violation details',
  'violation.notFound.title': 'No violation found',
  'violation.notFound.text': 'We couldn’t find a violation for {cin}. Double-check the QR code on the clamp.',
  'violation.error': 'We couldn’t load this violation. Check your connection and try again.',

  // Violation details
  'violation.title': 'Violation Details',
  'violation.found': 'Violation Found',
  'violation.review': 'Please review the details below.',
  'violation.cardLabel': 'Violation {cin}',
  'violation.rejected': 'Your last payment was not accepted by MTPB: {reason}',
  'violation.payAgain': 'You can pay again below.',
  'violation.viewReceipt': 'View Receipt',
  'violation.awaiting': 'Your payment was received and is waiting for verification by MTPB staff.',
  'violation.alreadyPaid': 'This violation is already paid.',
  'violation.waitEnforcer': 'Please wait for an enforcer to remove the clamp.',
  'violation.guestReceipt':
    'Paid as a guest? The receipt was only available right after paying. Ask the MTPB office for a copy.',
  'violation.avoid': 'Avoid penalties.',
  'violation.onTime': 'Pay your fine on time.',
  'violation.makeAccount': 'Make an Account',
  'violation.login': 'Login',
  'violation.questions': 'Have questions?',

  // Evidence photos
  'evidence.label': 'Evidence photos',
  'evidence.title': 'Evidence Photos',
  'evidence.note': 'Taken by the enforcer when the clamp was placed.',
  'evidence.view': 'View {caption}',
  'evidence.viewPhoto': 'View photo {n}',
  'evidence.photoOf': 'Photo {n} of {total}',
  'evidence.previous': 'Previous',
  'evidence.next': 'Next',
  'evidence.close': 'Close',

  // How do you want to pay?
  'choice.title': 'How do you want to pay?',
  'choice.text':
    'You can pay this violation right away, or make an account first to keep your receipts and see all your violations later.',
  'choice.error': 'We couldn’t start the payment. Check your connection and try again.',
  'choice.wait': 'Please wait…',
  'choice.guest': 'Pay now as guest',
  'choice.create': 'Create an account',
  'choice.haveAccount': 'I already have an account',

  // Pay Now step 1
  'pay.title': 'Pay Now',
  'pay.method.title': 'Choose Payment',
  'pay.method.text': 'Select a payment method to continue.',
  'pay.method.gcash': 'Pay using your GCash account',
  'pay.method.onsite': 'Pay Onsite',
  'pay.method.onsiteText': 'Pay at MTPB office.',
  'pay.onsite.title': 'Payment Instructions',
  'pay.onsite.proceed': 'Proceed to',
  'pay.onsite.back': 'Go Back',

  // Pay Now step 2
  'pay.details.title': 'Payment Details',
  'pay.details.text': 'Enter the required information to complete your payment.',
  'pay.details.via': 'Payment via {method}',
  'pay.details.mobile': 'Mobile Number',
  'pay.details.mobileError': 'Use an 11-digit number like 09171234567.',
  'pay.details.email': 'Email (Optional)',
  'pay.details.emailError': 'Enter a valid email or leave it blank.',
  'pay.details.emailNote': 'You will receive the payment receipt in this email.',
  'pay.details.redirect': 'You will be redirected to {method} to complete the payment.',
  'pay.details.proceed': 'Proceed to {method}',

  // Pay Now step 3
  'pay.confirm.title': 'Payment Confirmation',
  'pay.confirm.text': 'Please confirm your payment to finalize the transaction.',
  'pay.confirm.total': 'Total Amount Due',
  'pay.confirm.breakdown': 'Fine {fine} + {method} convenience fee {fee}',
  'pay.confirm.agree': 'By continuing, you agree to our',
  'pay.confirm.terms': 'Terms of Service',
  'pay.confirm.and': 'and',
  'pay.confirm.privacy': 'Privacy Policy.',
  'pay.confirm.failed': 'The payment didn’t go through. Please try again.',
  'pay.confirm.button': 'Confirm Payment',
  'pay.confirm.cancel': 'Cancel',
  'pay.processing': 'Processing your payment...',

  // Payment successful
  'success.confirming': 'Confirming your payment...',
  'success.loadError.title': 'We couldn’t load this payment',
  'success.loadError.text': 'Check your connection and open this page again.',
  'success.waiting.title': 'Still waiting for confirmation',
  'success.waiting.text':
    'We haven’t received confirmation from GCash yet. If you completed the payment, check again in a minute.',
  'success.checkAgain': 'Check again',
  'success.duplicate.title': 'This violation was already paid',
  'success.review.title': 'We need to check this payment',
  'success.duplicate.text': 'Your GCash payment went through, but this violation had already been paid.',
  'success.review.text': 'Your GCash payment went through, but it needs to be checked by MTPB staff.',
  'success.visitOffice':
    'Please visit the MTPB office with this page or your GCash confirmation so personnel can sort it out.',
  'success.reference': 'Reference:',
  'success.backToViolation': 'Back to violation',
  'success.title': 'Payment Successful',
  'success.received': 'Your payment was received. MTPB staff will verify it shortly.',
  'success.processed': 'Your payment has been processed successfully.',
  'success.summary': 'Payment summary',
  'success.total': 'Total Amount',
  'success.guest':
    'You paid as a guest, so this receipt is only here while this page is open. Open it and download a copy before you leave.',
  'success.seeReceipt': 'See Receipt',

  // Payment rows (success screen)
  'row.reference': 'Reference Number',
  'row.violationNumber': 'Violation Number',
  'row.violationId': 'Violation ID',
  'row.plate': 'Plate Number',
  'row.dateTime': 'Date & Time',
  'row.fine': 'Fine Amount',
  'row.fee': 'Convenience Fee',

  // Receipt (around the card)
  'receipt.loading': 'Loading your receipt...',
  'receipt.title': 'Receipt',
  'receipt.save': 'Save receipt as image',
  'receipt.saved': 'Receipt saved to your Downloads.',
  'receipt.saveFailed': 'The receipt couldn’t be saved. Please try again.',
  'receipt.guest.bold': 'Save this receipt now.',
  'receipt.guest.text':
    'You paid as a guest, so this receipt is only here while this page is open. Once you close it you can’t open it again — you’d have to ask for a copy at the MTPB office.',
  'receipt.guest.emailed': 'GCash also sends a copy to {email}.',
  'receipt.guest.gcash': 'Your GCash app also keeps a record of the payment.',
  'receipt.saving': 'Saving…',
  'receipt.download': 'Download receipt',
  'receipt.createAccount': 'Create an account to keep your receipts',
  'receipt.thanks': 'Thank you for your payment.',
  'receipt.drive': 'Please drive responsibly.',
  'receipt.okay': 'Okay',

  // FAQs
  'faq.title': 'FAQs',
  'faq.intro': 'Answers to the questions we get most often. Tap a question to see the full answer.',
  'faq.search': 'Search questions',
  'faq.clear': 'Clear search',
  'faq.filter': 'Filter by topic',
  'faq.result': '{n} result for “{q}”',
  'faq.results': '{n} results for “{q}”',
  'faq.empty.title': 'No question matches that.',
  'faq.empty.text': 'Try a different word, or visit the MTPB Office and our personnel will assist you.',
  'faq.empty.link': 'See the office location',
  'faq.office': 'MTPB Office',
  'faq.viewMap': 'View on map',
  'faq.footer': 'For further concerns, please visit our office.',

  // Impound location
  'impound.title': 'Impound Location',
  'impound.directions': 'Get directions',
}

const fil = {
  // Shared
  'common.goBack': 'Bumalik',
  'common.payNow': 'Magbayad Ngayon',
  'common.readFaqs': 'Basahin ang mga FAQ',
  'common.somethingWrong': 'May nangyaring mali',
  'common.pleaseWait': 'Sandali lang.',
  'common.mapShowing': 'Mapa ng {name}',
  'common.officeHours': 'Lunes hanggang Biyernes, 8:00 AM – 5:00 PM',

  // Status badges
  'status.unpaid': 'hindi pa bayad',
  'status.paid': 'bayad na',
  'status.verifying': 'bayad – bineberipika',
  'status.clamped': 'naka-clamp',
  'status.impounded': 'na-impound',

  // Step header
  'step.of': 'Hakbang {step} sa {total}',

  // Scanned clamp
  'scan.title': 'Na-scan na Clamp',
  'scan.loading': 'Binabasa ang code ng clamp…',
  'scan.error': 'Hindi namin mabasa ang code ng clamp na ito. Tingnan ang iyong koneksyon at i-scan muli.',
  'scan.clamp': 'Clamp',
  'scan.waiting.title': 'Walang babayaran sa clamp na ito',
  'scan.waiting.1': 'Wala pang naitalang paglabag sa clamp na ito.',
  'scan.waiting.2': 'Kung kaka-clamp lang ng enforcer sa iyong sasakyan, hintaying matapos sila at i-scan muli.',
  'scan.released.title': 'Naalis na ang clamp na ito',
  'scan.released.1': 'Bayad na ang paglabag sa clamp na ito at naalis na ang clamp.',
  'scan.released.2': 'Kung naka-clamp pa rin ang iyong sasakyan, makipag-ugnayan sa opisina ng MTPB.',
  'scan.notFound.title': 'Hindi nahanap ang clamp',
  'scan.notFound.1': 'Hindi nakarehistro sa MTPB ang code na ito.',
  'scan.notFound.2': 'Siguraduhing ang sticker sa clamp ang na-scan mo, o makipag-ugnayan sa opisina ng MTPB.',
  'scan.unknown.title': 'Hindi pa handa ang clamp',
  'scan.unknown.1': 'Walang paglabag sa clamp na ito na mababayaran mo ngayon.',
  'scan.unknown.2': 'Makipag-ugnayan sa opisina ng MTPB kung naka-clamp ang iyong sasakyan.',
  'scan.noCode.title': 'Walang clamp code sa link na iyon',
  'scan.noCode.text':
    'Walang clamp number sa QR code. Tingnan ang sticker sa clamp, o pumunta sa opisina ng MTPB dala ang iyong plate number at hahanapin nila ang paglabag para sa iyo.',

  // Violation loading / errors
  'violation.loading': 'Nilo-load ang detalye ng paglabag',
  'violation.notFound.title': 'Walang nahanap na paglabag',
  'violation.notFound.text': 'Walang nahanap na paglabag para sa {cin}. Tingnang muli ang QR code sa clamp.',
  'violation.error': 'Hindi ma-load ang paglabag na ito. Tingnan ang iyong koneksyon at subukang muli.',

  // Violation details
  'violation.title': 'Detalye ng Paglabag',
  'violation.found': 'May Nahanap na Paglabag',
  'violation.review': 'Pakisuri ang mga detalye sa ibaba.',
  'violation.cardLabel': 'Paglabag {cin}',
  'violation.rejected': 'Hindi tinanggap ng MTPB ang huli mong bayad: {reason}',
  'violation.payAgain': 'Maaari kang magbayad muli sa ibaba.',
  'violation.viewReceipt': 'Tingnan ang Resibo',
  'violation.awaiting': 'Natanggap na ang iyong bayad at hinihintay ang beripikasyon ng MTPB staff.',
  'violation.alreadyPaid': 'Bayad na ang paglabag na ito.',
  'violation.waitEnforcer': 'Hintayin ang enforcer na mag-aalis ng clamp.',
  'violation.guestReceipt':
    'Nagbayad bilang guest? Makikita lang ang resibo pagkatapos mismong magbayad. Humingi ng kopya sa opisina ng MTPB.',
  'violation.avoid': 'Iwasan ang dagdag na multa.',
  'violation.onTime': 'Bayaran ang multa sa tamang oras.',
  'violation.makeAccount': 'Gumawa ng Account',
  'violation.login': 'Mag-login',
  'violation.questions': 'May tanong?',

  // Evidence photos
  'evidence.label': 'Mga larawang ebidensya',
  'evidence.title': 'Mga Larawang Ebidensya',
  'evidence.note': 'Kinuha ng enforcer nang ilagay ang clamp.',
  'evidence.view': 'Tingnan ang {caption}',
  'evidence.viewPhoto': 'Tingnan ang larawan {n}',
  'evidence.photoOf': 'Larawan {n} sa {total}',
  'evidence.previous': 'Nakaraan',
  'evidence.next': 'Susunod',
  'evidence.close': 'Isara',

  // How do you want to pay?
  'choice.title': 'Paano mo gustong magbayad?',
  'choice.text':
    'Maaari mong bayaran agad ang paglabag na ito, o gumawa muna ng account para maitabi ang iyong mga resibo at makita ang lahat ng iyong paglabag sa susunod.',
  'choice.error': 'Hindi masimulan ang pagbabayad. Tingnan ang iyong koneksyon at subukang muli.',
  'choice.wait': 'Sandali lang…',
  'choice.guest': 'Magbayad bilang guest',
  'choice.create': 'Gumawa ng account',
  'choice.haveAccount': 'May account na ako',

  // Pay Now step 1
  'pay.title': 'Magbayad',
  'pay.method.title': 'Paraan ng Pagbabayad',
  'pay.method.text': 'Pumili ng paraan ng pagbabayad para magpatuloy.',
  'pay.method.gcash': 'Magbayad gamit ang iyong GCash account',
  'pay.method.onsite': 'Magbayad sa Opisina',
  'pay.method.onsiteText': 'Magbayad sa opisina ng MTPB.',
  'pay.onsite.title': 'Paano Magbayad',
  'pay.onsite.proceed': 'Pumunta sa',
  'pay.onsite.back': 'Bumalik',

  // Pay Now step 2
  'pay.details.title': 'Detalye ng Pagbabayad',
  'pay.details.text': 'Ilagay ang kinakailangang impormasyon para makumpleto ang iyong bayad.',
  'pay.details.via': 'Bayad gamit ang {method}',
  'pay.details.mobile': 'Numero ng Mobile',
  'pay.details.mobileError': 'Gumamit ng 11-digit na numero, halimbawa 09171234567.',
  'pay.details.email': 'Email (Opsyonal)',
  'pay.details.emailError': 'Maglagay ng tamang email o iwanang blangko.',
  'pay.details.emailNote': 'Dito mo matatanggap ang resibo ng iyong bayad.',
  'pay.details.redirect': 'Ililipat ka sa {method} para tapusin ang pagbabayad.',
  'pay.details.proceed': 'Magpatuloy sa {method}',

  // Pay Now step 3
  'pay.confirm.title': 'Kumpirmasyon ng Bayad',
  'pay.confirm.text': 'Pakikumpirma ang iyong bayad para matapos ang transaksyon.',
  'pay.confirm.total': 'Kabuuang Babayaran',
  'pay.confirm.breakdown': 'Multa {fine} + convenience fee ng {method} {fee}',
  'pay.confirm.agree': 'Sa pagpapatuloy, sumasang-ayon ka sa aming',
  'pay.confirm.terms': 'Terms of Service',
  'pay.confirm.and': 'at',
  'pay.confirm.privacy': 'Privacy Policy.',
  'pay.confirm.failed': 'Hindi natuloy ang bayad. Pakisubukang muli.',
  'pay.confirm.button': 'Kumpirmahin ang Bayad',
  'pay.confirm.cancel': 'Kanselahin',
  'pay.processing': 'Pinoproseso ang iyong bayad...',

  // Payment successful
  'success.confirming': 'Kinukumpirma ang iyong bayad...',
  'success.loadError.title': 'Hindi ma-load ang bayad na ito',
  'success.loadError.text': 'Tingnan ang iyong koneksyon at buksan muli ang page na ito.',
  'success.waiting.title': 'Hinihintay pa ang kumpirmasyon',
  'success.waiting.text':
    'Wala pang kumpirmasyon mula sa GCash. Kung natapos mo na ang bayad, tingnan muli makalipas ang isang minuto.',
  'success.checkAgain': 'Tingnan muli',
  'success.duplicate.title': 'Bayad na ang paglabag na ito',
  'success.review.title': 'Kailangan naming suriin ang bayad na ito',
  'success.duplicate.text': 'Pumasok ang iyong bayad sa GCash, pero bayad na pala ang paglabag na ito.',
  'success.review.text': 'Pumasok ang iyong bayad sa GCash, pero kailangan itong suriin ng MTPB staff.',
  'success.visitOffice':
    'Pumunta sa opisina ng MTPB dala ang page na ito o ang kumpirmasyon mula sa GCash para maayos ito ng aming mga tauhan.',
  'success.reference': 'Reference:',
  'success.backToViolation': 'Bumalik sa paglabag',
  'success.title': 'Matagumpay ang Pagbabayad',
  'success.received': 'Natanggap na ang iyong bayad. Beberipikahin ito ng MTPB staff sa lalong madaling panahon.',
  'success.processed': 'Matagumpay na naproseso ang iyong bayad.',
  'success.summary': 'Buod ng bayad',
  'success.total': 'Kabuuang Halaga',
  'success.guest':
    'Nagbayad ka bilang guest, kaya makikita lang ang resibong ito habang bukas ang page na ito. Buksan ito at mag-download ng kopya bago umalis.',
  'success.seeReceipt': 'Tingnan ang Resibo',

  // Payment rows (success screen)
  'row.reference': 'Reference Number',
  'row.violationNumber': 'Numero ng Paglabag',
  'row.violationId': 'ID ng Paglabag',
  'row.plate': 'Numero ng Plaka',
  'row.dateTime': 'Petsa at Oras',
  'row.fine': 'Halaga ng Multa',
  'row.fee': 'Convenience Fee',

  // Receipt (around the card)
  'receipt.loading': 'Nilo-load ang iyong resibo...',
  'receipt.title': 'Resibo',
  'receipt.save': 'I-save ang resibo bilang larawan',
  'receipt.saved': 'Na-save ang resibo sa iyong Downloads.',
  'receipt.saveFailed': 'Hindi na-save ang resibo. Pakisubukang muli.',
  'receipt.guest.bold': 'I-save na ang resibong ito.',
  'receipt.guest.text':
    'Nagbayad ka bilang guest, kaya makikita lang ang resibong ito habang bukas ang page na ito. Kapag isinara mo ito, hindi mo na ito mabubuksan muli — kailangan mong humingi ng kopya sa opisina ng MTPB.',
  'receipt.guest.emailed': 'Nagpapadala rin ang GCash ng kopya sa {email}.',
  'receipt.guest.gcash': 'May tala rin ng bayad sa iyong GCash app.',
  'receipt.saving': 'Sine-save…',
  'receipt.download': 'I-download ang resibo',
  'receipt.createAccount': 'Gumawa ng account para maitabi ang iyong mga resibo',
  'receipt.thanks': 'Salamat sa iyong pagbabayad.',
  'receipt.drive': 'Mag-ingat sa pagmamaneho.',
  'receipt.okay': 'Sige',

  // FAQs
  'faq.title': 'Mga FAQ',
  'faq.intro': 'Mga sagot sa mga madalas na tanong. I-tap ang tanong para makita ang buong sagot.',
  'faq.search': 'Maghanap ng tanong',
  'faq.clear': 'Burahin ang hinahanap',
  'faq.filter': 'Salain ayon sa paksa',
  'faq.result': '{n} resulta para sa “{q}”',
  'faq.results': '{n} resulta para sa “{q}”',
  'faq.empty.title': 'Walang tanong na tumutugma diyan.',
  'faq.empty.text': 'Sumubok ng ibang salita, o pumunta sa opisina ng MTPB at tutulungan ka ng aming mga tauhan.',
  'faq.empty.link': 'Tingnan ang lokasyon ng opisina',
  'faq.office': 'Opisina ng MTPB',
  'faq.viewMap': 'Tingnan sa mapa',
  'faq.footer': 'Para sa iba pang alalahanin, pumunta sa aming opisina.',

  // Impound location
  'impound.title': 'Lugar ng Impound',
  'impound.directions': 'Kumuha ng direksyon',
}

export const STRINGS = { en, fil }
