import json
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

import oc2jd


HEADERS = [
    "序号", "公司名称", "公司类型", "所属行业", "招聘类型", "招聘对象",
    "工作地点", "岗位", "更新时间", "投递截止", "内推码/备注",
    "官方投递入口(补充)", "投递说明(补充)",
]


def source_row(index, name, company_type, location, positions, deadline, url):
    return [
        index, name, company_type, "科技", "秋招", "2027届", location,
        positions, "2026-10-22", deadline, None, url, None,
    ]


class Oc2JdTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.input_path = self.root / "input.xlsx"
        self.output_path = self.root / "output.json"
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "校招汇总"
        sheet.append(HEADERS)
        sheet.append(source_row(1, "甲公司", "民企", "北京", "产品经理、数据分析师、财务经理", "招满为止", "https://a.example/jobs"))
        sheet.append(source_row(2, "乙公司", "央国企", "北京", "数据分析师", "2026-12-01", "https://b.example/jobs"))
        sheet.append(source_row(3, "乙公司", "央国企", "杭州", "数据分析师", "2026-12-01", "https://b.example/jobs"))
        sheet.append(source_row(4, "乙公司", "央国企", "深圳", "数据分析师", "2026-12-05", "https://b.example/jobs"))
        sheet.append(source_row(5, "丙公司", "外企/合资", "成都", "产品经理/数据分析师；战略分析", "招满为止", ""))
        sheet.append(source_row(6, "丁公司", "民企", "广州", "产品经理", "2026-10-01", "https://d.example/jobs"))
        workbook.save(self.input_path)
        workbook.close()

    def tearDown(self):
        self.temp.cleanup()

    def test_defaults_are_relative_to_script_directory(self):
        script_dir = Path(oc2jd.__file__).resolve().parent
        candidates = [directory / "givemeoc校招汇总.xlsx" for directory in oc2jd.PIPELINE_DIRS]
        expected_input = next((candidate for candidate in candidates if candidate.is_file()), candidates[0])
        self.assertEqual(oc2jd.DEFAULT_XLSX, expected_input)
        self.assertEqual(oc2jd.DEFAULT_OUT, script_dir / "jd-library-givemeoc.json")
        args = oc2jd.build_parser().parse_args([])
        self.assertEqual(args.input, oc2jd.DEFAULT_XLSX)
        self.assertEqual(args.output, oc2jd.DEFAULT_OUT)

    def test_conversion_splits_roles_and_preserves_listing_metadata(self):
        library = oc2jd.convert_workbook(self.input_path, self.output_path, today="2026-10-24")
        by_company = {}
        for job in library["jobs"]:
            by_company.setdefault(job["company"], []).append(job)

        alpha = by_company["甲公司"]
        self.assertEqual({job["track"] for job in alpha}, {"产品经理", "数据分析"})
        self.assertEqual(len(alpha), 2)
        self.assertEqual(alpha[0]["companyType"], "民企")
        self.assertEqual(alpha[0]["sourceListing"], alpha[0]["title"])
        self.assertEqual(alpha[0]["descriptionType"], "position_listing")
        self.assertNotIn("responsibilities", alpha[0])
        self.assertNotIn("keywords", alpha[0])
        self.assertEqual(alpha[0]["url"], "https://a.example/jobs")
        self.assertEqual(alpha[0]["deadline"], "招满为止")

        beta = by_company["乙公司"]
        self.assertEqual(len(beta), 2)
        merged = next(job for job in beta if job["deadline"] == "2026-12-01")
        self.assertEqual(set(merged["locations"]), {"北京", "杭州"})
        self.assertNotEqual(merged["id"], next(job for job in beta if job["deadline"] == "2026-12-05")["id"])
        self.assertNotIn("丁公司", by_company)

        delta = by_company["丙公司"]
        self.assertEqual(len(delta), 2)
        self.assertEqual(next(job for job in delta if job["track"] == "数据分析")["sourceListing"], "产品经理/数据分析师")
        self.assertTrue(all(job["url"] == "" for job in delta))

        written = json.loads(self.output_path.read_text(encoding="utf-8"))
        self.assertEqual(written, library)

    def test_ids_are_stable_when_source_rows_are_reordered(self):
        rows = [
            source_row(2, "乙公司", "央国企", "北京", "数据分析师", "2026-12-01", "https://b.example/jobs"),
            source_row(3, "乙公司", "央国企", "杭州", "数据分析师", "2026-12-01", "https://b.example/jobs"),
        ]
        first = oc2jd.convert_rows(rows, today="2026-10-24")["jobs"]
        second = oc2jd.convert_rows(list(reversed(rows)), today="2026-10-24")["jobs"]
        self.assertEqual([job["id"] for job in first], [job["id"] for job in second])
        self.assertEqual(set(first[0]["locations"]), set(second[0]["locations"]))


if __name__ == "__main__":
    unittest.main()
