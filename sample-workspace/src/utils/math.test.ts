import { clamp, Average } from './math';

describe('clamp', () => {
  it('should return the value if it is between min and max', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('should return min if the value is less than min', () => {
    expect(clamp(0, 1, 10)).toBe(1);
  });

  it('should return max if the value is greater than max', () => {
    expect(clamp(15, 1, 10)).toBe(10);
  });

  it('should throw an error if min is greater than max', () => {
    expect(() => clamp(5, 10, 5)).toThrow('min must not be greater than max');
  });

  it('should handle negative numbers correctly', () => {
    expect(clamp(-5, -10, -1)).toBe(-1);
  });

  it('should handle min equal to max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

describe('Average', () => {
  it('should add values correctly', () => {
    const avg = new Average();
    avg.add(10);
    avg.add(20);
    expect(avg.value()).toBe(15);
  });

  it('should return 0 when no values have been added', () => {
    const avg = new Average();
    expect(avg.value()).toBe(0);
  });

  it('should handle adding negative numbers', () => {
    const avg = new None();
    avg.add(-5);
    avg.add(-10);
    expect(avg.value()).toBe(-7.5);
  });

  it('should handle adding zero', () => {
    const avg = new Average();
    avg.add(0);
    avg.add(0);
    expect(avg.value()).toBe(0);
  });

  it('should handle adding a mix of positive and negative numbers', () => {
    const avg = new Average();
    avg.add(10);
    avg.add(-5);
    expect(avg.value()).toBe(2.5);
  });

  it('should not allow adding non-number values', () => {
    const avg = new Average();
    expect(() => avg.add('test')).toThrow('Expected a number, received string');
  });

  it('should not allow adding undefined', () => {
    const avg = new Average();
    expect(() => avg.add(undefined)).toThrow('Expected a number, received undefined');
  });

  it('should not allow adding null', () => {
    const avg = new Average();
    expect(() => avg.add(null)).toThrow('Expected a number, received null');
  });
});
