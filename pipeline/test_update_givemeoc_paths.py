import json
import tempfile
import unittest
from pathlib import Path

import update_givemeoc


class PipelinePathTests(unittest.TestCase):
    def test_defaults_are_relative_to_pipeline_directory(self):
        pipeline_dir = Path(update_givemeoc.__file__).resolve().parent
        self.assertEqual(Path(update_givemeoc.XLSX), pipeline_dir / "givemeoc校招汇总.xlsx")
        self.assertEqual(Path(update_givemeoc.CACHE), pipeline_dir / "givemeoc_cache.json")
        self.assertEqual(Path(update_givemeoc.ENRICH_FILE), pipeline_dir / "enrichment.json")

    def test_cli_accepts_all_local_data_paths(self):
        parser = update_givemeoc.build_parser()
        args = parser.parse_args([
            "--xlsx", "/tmp/source.xlsx",
            "--cache", "/tmp/cache.json",
            "--enrichment", "/tmp/enrichment.json",
        ])
        self.assertEqual(args.xlsx, Path("/tmp/source.xlsx"))
        self.assertEqual(args.cache, Path("/tmp/cache.json"))
        self.assertEqual(args.enrichment, Path("/tmp/enrichment.json"))

    def test_enrichment_is_loaded_only_from_local_file(self):
        self.assertEqual(update_givemeoc._load_entries(Path("/missing/enrichment.json")), {})
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "enrichment.json"
            data = {"entries": {"样例公司": ["https://example.com/jobs", "本地备注"]}}
            source.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(update_givemeoc._load_entries(source), data["entries"])


if __name__ == "__main__":
    unittest.main()
