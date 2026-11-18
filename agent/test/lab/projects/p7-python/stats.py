# Средние значения для отчёта.
def average(nums):
    return sum(nums) / len(nums)


def median(nums):
    ordered = sorted(nums)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2
