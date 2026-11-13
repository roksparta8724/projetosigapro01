import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scan_pdf import MAX_BYTES, ScanError, parse_pdfinfo, process_pdf, main


class OfflineOcrContract(unittest.TestCase):
    def test_page_count_and_encryption(self):
        self.assertEqual(parse_pdfinfo('Pages:          3\nEncrypted:      no\n'), (3, False))
        self.assertEqual(parse_pdfinfo('Pages:          2\nEncrypted:      yes (print:yes)\n'), (2, True))
        for pages in ('0', '17', '-1', 'not-a-number'):
            with self.assertRaises(ScanError):
                parse_pdfinfo('Pages: '+pages+'\nEncrypted: no\n')

    def test_blocks_invalid_or_symlinked_pdf(self):
        with TemporaryDirectory() as root:
            invalid = Path(root)/'broken.pdf'
            invalid.write_bytes(b'NOT A PDF')
            with self.assertRaisesRegex(ScanError, 'PDF_SIZE_INVALID'):
                process_pdf(invalid)
            invalid.write_bytes(b'NOT A PDF'+b'0'*100)
            with self.assertRaisesRegex(ScanError, 'PDF_HEADER_INVALID'):
                process_pdf(invalid)
            symlink = Path(root)/'linked.pdf'
            symlink.symlink_to(invalid)
            with self.assertRaisesRegex(ScanError, 'PDF_PATH_NOT_ALLOWED'):
                process_pdf(symlink)

    def test_stops_before_large_untrusted_payload(self):
        with TemporaryDirectory() as root:
            pdf = Path(root)/'large.pdf'
            with pdf.open('wb') as file:
                file.seek(MAX_BYTES)
                file.write(b'0')
            with self.assertRaisesRegex(ScanError, 'PDF_SIZE_INVALID'):
                process_pdf(pdf)

    def test_cli_never_overwrites_an_existing_result(self):
        with TemporaryDirectory() as root:
            pdf = Path(root)/'synthetic.pdf'
            pdf.write_bytes(b'%PDF- '+b'0'*105)
            output = Path(root)/'results.json'
            output.write_text('KEEP')
            self.assertEqual(main([str(pdf), '--output', str(output)]), 2)
            self.assertEqual(output.read_text(), 'KEEP')

    def test_review_only_contract_and_private_permissions(self):
        with TemporaryDirectory() as root:
            pdf = Path(root)/'fixture.pdf'
            pdf.write_bytes(b'%PDF-'+b'0'*100)
            output = Path(root)/'result.json'
            simulated = {
              "source": "sigapro_local_ocr_text_only",
              "document_sha256": "a"*64,
              "page_count": 1,
              "pages": [{"page": 1, "text": "Recuo frontal proposto: 5,00 m",
                         "requires_visual_review": True}],
              "automaticallyApproved": False,
              "measurementsVerified": False,
            }
            with patch('scan_pdf.process_pdf', return_value=simulated):
                self.assertEqual(main([str(pdf), '--output', str(output)]), 0)
            persisted = json.loads(output.read_text(encoding='utf8'))
            self.assertFalse(persisted['automaticallyApproved'])
            self.assertFalse(persisted['measurementsVerified'])
            self.assertTrue(persisted['pages'][0]['requires_visual_review'])
            if os.name == 'posix':
                self.assertEqual(output.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
